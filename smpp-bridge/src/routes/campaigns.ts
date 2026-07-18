import { Hono } from "hono";
import { z } from "zod";
import { getCampaignQueue, type CampaignChunkJob } from "../lib/queue/campaign-queue.js";
import { logger } from "../lib/logger.js";

const campaignRoutes = new Hono();

const chunkSchema = z.object({
  campaignId: z.string().uuid(),
  organizationId: z.string().uuid(),
  message: z.string().min(1),
  sourceAddr: z.string().min(1),
  connectorId: z.string().nullable(),
  recipients: z.array(z.object({
    contactId: z.string().uuid(),
    phone: z.string().min(1),
  })),
});

const launchSchema = z.object({
  chunks: z.array(chunkSchema).min(1),
});

campaignRoutes.post("/api/v1/campaigns/launch", async (c) => {
  const body = await c.req.json();
  const parsed = launchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const queue = getCampaignQueue();
  let enqueuedChunks = 0;
  for (let i = 0; i < parsed.data.chunks.length; i++) {
    const job: CampaignChunkJob = parsed.data.chunks[i]!;
    try {
      await queue.add(`campaign-${job.campaignId}-chunk-${i}`, job, {
        jobId: `${job.campaignId}-${i}`,
      });
      enqueuedChunks += 1;
    } catch (err) {
      logger.error(
        { err: (err as Error).message, campaignId: job.campaignId, chunkIndex: i },
        "Failed to enqueue campaign chunk"
      );
    }
  }

  return c.json({ enqueuedChunks, totalChunks: parsed.data.chunks.length });
});

campaignRoutes.post("/api/v1/campaigns/:id/cancel-jobs", async (c) => {
  const id = c.req.param("id");
  try {
    const queue = getCampaignQueue();
    const waiting = await queue.getWaiting();
    const delayed = await queue.getDelayed();
    let removed = 0;
    for (const j of [...waiting, ...delayed]) {
      if (j.id?.startsWith(`${id}-`)) {
        await j.remove();
        removed += 1;
      }
    }
    return c.json({ removed });
  } catch (err) {
    logger.warn({ err: (err as Error).message, campaignId: id }, "Failed to cancel campaign jobs");
    return c.json({ error: "Failed to cancel campaign jobs" }, 500);
  }
});

export default campaignRoutes;
