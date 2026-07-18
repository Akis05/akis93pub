import { Queue, Worker, type Job } from "bullmq";
import crypto from "node:crypto";
import { getRedisConnection } from "./redis.js";
import { enqueueSms } from "./sms-queue.js";
import prisma from "../prisma.js";
import { logger } from "../logger.js";

export const CAMPAIGN_QUEUE_NAME = "campaign-chunks";

export interface CampaignChunkJob {
  campaignId: string;
  organizationId: string;
  message: string;
  sourceAddr: string;
  connectorId: string | null;
  recipients: Array<{ contactId: string; phone: string }>;
}

let _campaignQueue: Queue<CampaignChunkJob, void> | null = null;
let _campaignWorker: Worker<CampaignChunkJob, void> | null = null;

export function getCampaignQueue(): Queue<CampaignChunkJob, void> {
  if (_campaignQueue) return _campaignQueue;
  _campaignQueue = new Queue<CampaignChunkJob, void>(CAMPAIGN_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 24 * 3600, count: 1_000 },
      removeOnFail: false,
    },
  });
  return _campaignQueue;
}

async function processChunk(job: Job<CampaignChunkJob, void>): Promise<void> {
  const { campaignId, organizationId, message, sourceAddr, recipients } = job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!campaign) {
    logger.warn({ campaignId }, "Campaign chunk: campaign no longer exists, dropping chunk");
    return;
  }
  if (campaign.status === "PAUSED" || campaign.status === "CANCELLED") {
    logger.info({ campaignId, status: campaign.status }, "Campaign chunk skipped (paused/cancelled)");
    return;
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: recipients.map((r) => r.contactId) } },
    select: { id: true, isBlacklisted: true, deletedAt: true },
  });
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const eligible: Array<{ contactId: string; phone: string; smsId: string }> = [];
  let blockedCount = 0;
  for (const recipient of recipients) {
    const contact = contactById.get(recipient.contactId);
    if (!contact || contact.deletedAt || contact.isBlacklisted) {
      blockedCount++;
      continue;
    }
    eligible.push({ ...recipient, smsId: crypto.randomUUID() });
  }

  if (eligible.length > 0) {
    await prisma.smsMessage.createMany({
      data: eligible.map((r) => ({
        id: r.smsId,
        direction: "OUTBOUND" as const,
        sourceAddr,
        destinationAddr: r.phone,
        content: message,
        status: "QUEUED" as const,
        campaignId,
        contactId: r.contactId,
        organizationId,
      })),
    });
  }

  let enqueuedCount = 0;
  let enqueueFailedCount = 0;
  for (const recipient of eligible) {
    try {
      await enqueueSms({
        to: recipient.phone,
        text: message,
        from: sourceAddr,
        requestDeliveryReceipt: true,
        externalId: recipient.smsId,
      });
      enqueuedCount++;
    } catch (err) {
      logger.error(
        { err: (err as Error).message, campaignId, contactId: recipient.contactId },
        "Failed to enqueue campaign recipient"
      );
      enqueueFailedCount++;
    }
  }

  const failedCount = blockedCount + enqueueFailedCount;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(enqueuedCount ? { sentCount: { increment: enqueuedCount } } : {}),
      ...(failedCount ? { failedCount: { increment: failedCount } } : {}),
    },
  });

  const refreshed = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { sentCount: true, failedCount: true, totalRecipients: true, status: true },
  });
  if (refreshed && refreshed.status === "RUNNING") {
    const processed = refreshed.sentCount + refreshed.failedCount;
    if (processed >= refreshed.totalRecipients) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      logger.info({ campaignId, processed }, "Campaign completed");
    }
  }
}

export function startCampaignWorker(): Worker<CampaignChunkJob, void> {
  if (_campaignWorker) return _campaignWorker;
  const worker = new Worker<CampaignChunkJob, void>(CAMPAIGN_QUEUE_NAME, processChunk, {
    connection: getRedisConnection(),
    concurrency: Number(process.env.CAMPAIGN_WORKER_CONCURRENCY ?? 4),
    autorun: true,
  });

  worker.on("failed", (job, err) => {
    logger.warn(
      { jobId: job?.id, campaignId: job?.data.campaignId, err: err.message },
      "Campaign chunk failed"
    );
  });
  worker.on("error", (err) => logger.error({ err: err.message }, "Campaign worker error"));

  _campaignWorker = worker;
  logger.info({ concurrency: worker.opts.concurrency }, "Campaign worker started");
  return worker;
}

export async function incrementCampaignCounters(
  campaignId: string,
  delta: { delivered?: number; failed?: number }
): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(delta.delivered ? { deliveredCount: { increment: delta.delivered } } : {}),
      ...(delta.failed ? { failedCount: { increment: delta.failed } } : {}),
    },
  });
}
