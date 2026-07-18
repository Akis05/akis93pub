import { Hono } from "hono";
import { z } from "zod";
import { reportsQueue } from "../lib/queue/reports-queue.js";
import { logger } from "../lib/logger.js";

const reportRoutes = new Hono();

const scheduleSchema = z.object({
  name: z.string().min(1),
  filters: z.record(z.unknown()),
  cron: z.string().min(1),
  recipients: z.array(z.string()).min(1),
  organizationId: z.string().uuid(),
  userEmail: z.string().email(),
});

reportRoutes.post("/api/v1/reports/schedule", async (c) => {
  const body = await c.req.json();
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    const queue = reportsQueue();
    const job = await queue.add("scheduled-report", parsed.data, {
      repeat: { pattern: parsed.data.cron },
      removeOnComplete: { age: 30 * 86_400 },
    });
    return c.json({ jobId: job.id ?? "" });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to schedule report");
    return c.json({ error: "Failed to schedule report" }, 500);
  }
});

reportRoutes.get("/api/v1/reports/scheduled", async (c) => {
  try {
    const queue = reportsQueue();
    const repeatables = await queue.getRepeatableJobs();
    return c.json({
      data: repeatables.map((r) => ({
        id: r.id ?? r.key,
        name: r.name,
        cron: r.pattern ?? null,
        next: r.next ?? null,
        key: r.key,
      })),
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to list scheduled reports");
    return c.json({ error: "Failed to list scheduled reports" }, 500);
  }
});

reportRoutes.delete("/api/v1/reports/scheduled/:key", async (c) => {
  const key = c.req.param("key");
  try {
    const queue = reportsQueue();
    await queue.removeRepeatableByKey(key);
    return c.json({ message: "Removed" });
  } catch (err) {
    logger.error({ err: (err as Error).message, key }, "Failed to cancel scheduled report");
    return c.json({ error: "Failed to cancel scheduled report" }, 500);
  }
});

export default reportRoutes;
