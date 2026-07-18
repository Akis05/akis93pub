import { Hono } from "hono";
import { getQueueCounts, getSmsQueue, pauseSmsWorker, resumeSmsWorker } from "../lib/queue/sms-queue.js";
import { getCampaignQueue } from "../lib/queue/campaign-queue.js";
import { logger } from "../lib/logger.js";

const queueRoutes = new Hono();

queueRoutes.get("/api/v1/queue/stats", async (c) => {
  const smsCounts = await getQueueCounts();

  let campaignCounts = {};
  try {
    const cq = getCampaignQueue();
    campaignCounts = await cq.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
  } catch {
    campaignCounts = { error: "unavailable" };
  }

  return c.json({
    sms: smsCounts,
    campaign: campaignCounts,
  });
});

queueRoutes.post("/api/v1/queue/pause", async (c) => {
  try {
    await pauseSmsWorker();
    return c.json({ message: "SMS worker paused" });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Failed to pause SMS worker");
    return c.json({ error: "Failed to pause worker" }, 500);
  }
});

queueRoutes.post("/api/v1/queue/resume", async (c) => {
  try {
    await resumeSmsWorker();
    return c.json({ message: "SMS worker resumed" });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Failed to resume SMS worker");
    return c.json({ error: "Failed to resume worker" }, 500);
  }
});

queueRoutes.post("/api/v1/queue/purge", async (c) => {
  try {
    const queue = getSmsQueue();
    await queue.drain(true);
    return c.json({ message: "Queue drained" });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Failed to drain SMS queue");
    return c.json({ error: "Failed to drain queue" }, 500);
  }
});

queueRoutes.post("/api/v1/queue/retry/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  try {
    const queue = getSmsQueue();
    const job = await queue.getJob(jobId);
    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }
    await job.retry();
    logger.info({ jobId }, "Job retried");
    return c.json({ message: "Job retried", jobId });
  } catch (err) {
    logger.error({ err: (err as Error).message, jobId }, "Failed to retry job");
    return c.json({ error: "Failed to retry job" }, 500);
  }
});

export default queueRoutes;
