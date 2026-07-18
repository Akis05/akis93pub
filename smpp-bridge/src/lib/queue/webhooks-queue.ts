import { Queue, Worker, type Job } from "bullmq";
import crypto from "node:crypto";
import { getRedisConnection } from "./redis.js";
import prisma from "../prisma.js";
import { logger } from "../logger.js";

export const WEBHOOKS_QUEUE = "webhooks";

export interface WebhookDeliveryJob {
  webhookId: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
}

let _webhooksQueue: Queue<WebhookDeliveryJob, void> | null = null;
let _webhooksWorker: Worker<WebhookDeliveryJob, void> | null = null;

export function getWebhooksQueue(): Queue<WebhookDeliveryJob, void> {
  if (_webhooksQueue) return _webhooksQueue;
  _webhooksQueue = new Queue<WebhookDeliveryJob, void>(WEBHOOKS_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 7 * 86_400 },
      removeOnFail: false,
    },
  });
  return _webhooksQueue;
}

export async function enqueueWebhookDelivery(data: WebhookDeliveryJob): Promise<void> {
  await getWebhooksQueue().add(`hook-${data.event}`, data);
}

function signPayload(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function processDelivery(job: Job<WebhookDeliveryJob, void>): Promise<void> {
  const start = Date.now();
  const body = JSON.stringify(job.data.payload);

  const webhook = await prisma.webhook.findUnique({
    where: { id: job.data.webhookId },
    select: { secret: true },
  });
  if (!webhook) {
    logger.warn({ webhookId: job.data.webhookId }, "Webhook delivery skipped: webhook no longer exists");
    return;
  }
  const signature = signPayload(webhook.secret, body);

  let statusCode: number | null = null;
  let responseText = "";
  let success = false;
  try {
    const res = await fetch(job.data.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SMS-Gateway-Signature": signature,
        "X-SMS-Gateway-Event": job.data.event,
      },
      body,
    });
    statusCode = res.status;
    responseText = (await res.text()).slice(0, 2000);
    success = res.ok;
  } catch (err) {
    responseText = (err as Error).message;
  }

  await prisma.webhookDelivery.create({
    data: {
      webhookId: job.data.webhookId,
      event: job.data.event,
      payload: job.data.payload as never,
      statusCode: statusCode ?? undefined,
      response: responseText,
      latencyMs: Date.now() - start,
      attempts: job.attemptsMade + 1,
      deliveredAt: success ? new Date() : null,
    },
  });

  await prisma.webhook.update({
    where: { id: job.data.webhookId },
    data: {
      lastTriggeredAt: new Date(),
      lastSuccessAt: success ? new Date() : undefined,
      lastFailureAt: success ? undefined : new Date(),
      failureCount: success ? 0 : { increment: 1 },
    },
  });

  if (!success && statusCode !== null && statusCode < 500) {
    return;
  }
  if (!success) {
    throw new Error(`Webhook delivery failed: status=${statusCode ?? "network"} body=${responseText.slice(0, 200)}`);
  }
}

export function startWebhooksWorker(): Worker<WebhookDeliveryJob, void> {
  if (_webhooksWorker) return _webhooksWorker;
  const worker = new Worker<WebhookDeliveryJob, void>(WEBHOOKS_QUEUE, processDelivery, {
    connection: getRedisConnection(),
    concurrency: Number(process.env.WEBHOOKS_WORKER_CONCURRENCY ?? 5),
    autorun: true,
  });
  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err: err.message }, "Webhook delivery failed");
  });
  worker.on("error", (err) => logger.error({ err: err.message }, "Webhooks worker error"));

  _webhooksWorker = worker;
  logger.info({ concurrency: worker.opts.concurrency }, "Webhooks BullMQ worker started");
  return worker;
}

export async function dispatchEvent(organizationId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const hooks = await prisma.webhook.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      select: { id: true, url: true, events: true },
    });
    for (const w of hooks) {
      if (!w.events.includes(event)) continue;
      await enqueueWebhookDelivery({
        webhookId: w.id, url: w.url, event, payload,
      });
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, event }, "dispatchEvent failed");
  }
}
