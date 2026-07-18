import { Hono } from "hono";
import { z } from "zod";
import { enqueueWebhookDelivery } from "../lib/queue/webhooks-queue.js";
import { logger } from "../lib/logger.js";

const webhookRoutes = new Hono();

const testSchema = z.object({
  webhookId: z.string().uuid(),
  url: z.string().url(),
  event: z.string().min(1),
  payload: z.record(z.unknown()),
});

webhookRoutes.post("/api/v1/webhooks/test-delivery", async (c) => {
  const body = await c.req.json();
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  try {
    await enqueueWebhookDelivery(parsed.data);
    return c.json({ message: "Test delivery enqueued" });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to enqueue test webhook delivery");
    return c.json({ error: "Failed to enqueue test delivery" }, 500);
  }
});

export default webhookRoutes;
