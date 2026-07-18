import { Hono } from "hono";
import { z } from "zod";
import { enqueueSms } from "../lib/queue/sms-queue.js";
import { requiresUnicode, computeSegments } from "../lib/sms-encoding.js";
import { logger } from "../lib/logger.js";

const smsRoutes = new Hono();

const sendSchema = z.object({
  to: z.string().min(1),
  text: z.string().min(1),
  from: z.string().optional(),
  scheduledAt: z.number().optional(),
  organizationId: z.string().uuid(),
  requestDeliveryReceipt: z.boolean().optional().default(true),
  externalId: z.string().uuid().optional(),
});

const bulkSchema = z.object({
  messages: z.array(z.object({
    to: z.string().min(1),
    text: z.string().min(1),
    from: z.string().optional(),
    externalId: z.string().uuid().optional(),
  })).min(1).max(1000),
  organizationId: z.string().uuid(),
  scheduledAt: z.number().optional(),
  requestDeliveryReceipt: z.boolean().optional().default(true),
});

smsRoutes.post("/api/v1/sms/send", async (c) => {
  const body = await c.req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const unicode = requiresUnicode(data.text);
  const segments = computeSegments(data.text, unicode);

  try {
    const jobId = await enqueueSms({
      to: data.to,
      text: data.text,
      from: data.from,
      scheduledAt: data.scheduledAt,
      organizationId: data.organizationId,
      requestDeliveryReceipt: data.requestDeliveryReceipt,
      externalId: data.externalId,
      segments,
      encoding: unicode ? "UCS2" : "GSM7",
    });

    return c.json({
      jobId,
      segments,
      encoding: unicode ? "UCS2" : "GSM7",
      scheduled: !!data.scheduledAt,
    }, 202);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to enqueue SMS");
    return c.json({ error: "Failed to enqueue SMS" }, 500);
  }
});

smsRoutes.post("/api/v1/sms/bulk", async (c) => {
  const body = await c.req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const results: Array<{ to: string; jobId: string; error?: string }> = [];

  for (const msg of data.messages) {
    try {
      const unicode = requiresUnicode(msg.text);
      const segments = computeSegments(msg.text, unicode);
      const jobId = await enqueueSms({
        to: msg.to,
        text: msg.text,
        from: msg.from,
        scheduledAt: data.scheduledAt,
        organizationId: data.organizationId,
        requestDeliveryReceipt: data.requestDeliveryReceipt,
        externalId: msg.externalId,
        segments,
        encoding: unicode ? "UCS2" : "GSM7",
      });
      results.push({ to: msg.to, jobId });
    } catch (err) {
      results.push({ to: msg.to, jobId: "", error: (err as Error).message });
    }
  }

  const failed = results.filter((r) => r.error);
  return c.json({
    total: data.messages.length,
    enqueued: data.messages.length - failed.length,
    failed: failed.length,
    results,
  }, 202);
});

export default smsRoutes;
