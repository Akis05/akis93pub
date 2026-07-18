import { Queue, Worker, QueueEvents, type Job, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./redis.js";
import { sendSms, type SendSmsParams, type SendSmsResult } from "../smpp/send-sms.js";
import { getSmppClient } from "../smpp/instance.js";
import { logger } from "../logger.js";
import prisma from "../prisma.js";
import type { MessageStatus } from "../../generated/prisma/client.js";

async function syncMessageStatus(
  job: Job<SmsJobData, SendSmsResult>,
  status: MessageStatus,
  extra: { providerMessageId?: string; sentAt?: Date } = {}
): Promise<void> {
  try {
    const externalId = job.data.externalId;
    if (externalId) {
      await prisma.smsMessage.updateMany({
        where: { id: externalId },
        data: { status, jobId: job.id ?? null, ...extra },
      });
      return;
    }
    await prisma.smsMessage.updateMany({
      where: { jobId: job.id ?? "__none__" },
      data: { status, ...extra },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, jobId: job.id, status }, "Failed to sync SmsMessage status");
  }
}

export const SMS_QUEUE_NAME = "sms";
export const SMS_DLQ_NAME = "sms-dlq";

export interface SmsJobData extends SendSmsParams {
  scheduledAt?: number;
  externalId?: string;
  organizationId?: string;
  segments?: number;
  encoding?: "GSM7" | "UCS2";
}

let _smsQueue: Queue<SmsJobData, SendSmsResult> | null = null;
let _smsDlq: Queue<SmsJobData, never> | null = null;
let _smsWorker: Worker<SmsJobData, SendSmsResult> | null = null;
let _smsQueueEvents: QueueEvents | null = null;

export function getSmsQueue(): Queue<SmsJobData, SendSmsResult> {
  if (_smsQueue) return _smsQueue;
  _smsQueue = new Queue<SmsJobData, SendSmsResult>(SMS_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 5_000 },
      removeOnFail: false,
    },
  });
  return _smsQueue;
}

export function getSmsDlq(): Queue<SmsJobData, never> {
  if (_smsDlq) return _smsDlq;
  _smsDlq = new Queue<SmsJobData, never>(SMS_DLQ_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
  });
  return _smsDlq;
}

export async function enqueueSms(data: SmsJobData, opts: JobsOptions = {}): Promise<string> {
  const queue = getSmsQueue();
  const jobOpts: JobsOptions = { ...opts };
  if (data.scheduledAt && data.scheduledAt > Date.now()) {
    jobOpts.delay = data.scheduledAt - Date.now();
  }
  const job = await queue.add("send", data, jobOpts);
  logger.info(
    { jobId: job.id, to: data.to, delay: jobOpts.delay ?? 0, externalId: data.externalId },
    "SMS enqueued in BullMQ"
  );

  try {
    if (data.externalId) {
      await prisma.smsMessage.updateMany({
        where: { id: data.externalId },
        data: { status: "QUEUED", jobId: job.id ?? null },
      });
    } else if (data.organizationId) {
      await prisma.smsMessage.create({
        data: {
          direction: "OUTBOUND",
          sourceAddr: data.from ?? "",
          destinationAddr: data.to,
          content: data.text,
          encoding: data.encoding ?? "GSM7",
          segments: data.segments ?? 1,
          status: "QUEUED",
          jobId: job.id ?? null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          organizationId: data.organizationId,
        },
      });
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, jobId: job.id }, "Failed to sync SmsMessage on enqueue");
  }

  return job.id!;
}

async function processJob(job: Job<SmsJobData, SendSmsResult>): Promise<SendSmsResult> {
  const client = getSmppClient();
  if (client.getState() !== "bound") {
    throw new Error(`SMPP not bound (state=${client.getState()}), will retry`);
  }
  const { wireDeliveryReceiptHandling } = await import("../smpp/wire-delivery-receipts.js");
  wireDeliveryReceiptHandling();

  await syncMessageStatus(job, "SENDING");

  const result = await sendSms({
    to: job.data.to,
    text: job.data.text,
    from: job.data.from,
    requestDeliveryReceipt: job.data.requestDeliveryReceipt,
  });

  await syncMessageStatus(job, "SENT", {
    providerMessageId: result.messageId,
    sentAt: new Date(),
  });

  return result;
}

export function startSmsWorker(): Worker<SmsJobData, SendSmsResult> {
  if (_smsWorker) return _smsWorker;

  const worker = new Worker<SmsJobData, SendSmsResult>(SMS_QUEUE_NAME, processJob, {
    connection: getRedisConnection(),
    concurrency: Number(process.env.SMS_WORKER_CONCURRENCY ?? 10),
    autorun: true,
  });

  worker.on("completed", (job, result) => {
    logger.info(
      { jobId: job.id, messageId: result?.messageId, to: job.data.to },
      "SMS job completed"
    );
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    logger.warn(
      { jobId: job.id, attempts: job.attemptsMade, to: job.data.to, err: err.message },
      "SMS job failed"
    );
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await syncMessageStatus(job, "FAILED");
      try {
        await getSmsDlq().add("dead", job.data, {
          jobId: `${job.id}-dlq`,
          removeOnComplete: false,
          removeOnFail: false,
        });
        logger.error(
          { jobId: job.id, to: job.data.to, err: err.message },
          "SMS job moved to dead-letter queue"
        );
      } catch (dlqErr) {
        logger.error({ dlqErr }, "Failed to push job to DLQ");
      }
    }
  });

  worker.on("error", (err) => logger.error({ err: err.message }, "SMS worker error"));

  _smsWorker = worker;

  try {
    getSmppClient().on("bound", () => {
      try {
        const result = worker.resume() as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
          (result as Promise<unknown>).catch((err: unknown) => {
            logger.warn({ err: (err as Error)?.message }, "Failed to resume SMS worker");
          });
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "Failed to resume SMS worker");
      }
    });
  } catch {
    // SMPP env may be unset
  }

  logger.info({ concurrency: worker.opts.concurrency }, "SMS BullMQ worker started");
  return worker;
}

export async function getQueueCounts() {
  const queue = getSmsQueue();
  return queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
}

export async function pauseSmsWorker(): Promise<void> {
  if (_smsWorker) await _smsWorker.pause();
}

export async function resumeSmsWorker(): Promise<void> {
  if (_smsWorker) await _smsWorker.resume();
}

export async function shutdownSmsQueue(): Promise<void> {
  try {
    await _smsWorker?.close();
    await _smsQueueEvents?.close();
    await _smsQueue?.close();
    await _smsDlq?.close();
  } catch (err) {
    logger.error({ err }, "Error while shutting down SMS queue");
  }
}
