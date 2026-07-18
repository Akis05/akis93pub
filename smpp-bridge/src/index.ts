import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { loadBridgeEnv } from "./env.js";
import { bearerAuth } from "./middleware/auth.js";
import { logger } from "./lib/logger.js";
import { registerShutdownHandlers } from "./lib/shutdown.js";
import { startSmsWorker } from "./lib/queue/sms-queue.js";
import { startCampaignWorker } from "./lib/queue/campaign-queue.js";
import { startWebhooksWorker } from "./lib/queue/webhooks-queue.js";
import { wireDeliveryReceiptHandling } from "./lib/smpp/wire-delivery-receipts.js";
import { getSmppClient } from "./lib/smpp/instance.js";

import healthRoutes from "./routes/health.js";
import smppRoutes from "./routes/smpp.js";
import smsRoutes from "./routes/sms.js";
import queueRoutes from "./routes/queue.js";
import campaignRoutes from "./routes/campaigns.js";
import webhookRoutes from "./routes/webhooks.js";
import reportRoutes from "./routes/reports.js";

const env = loadBridgeEnv();

const app = new Hono();

app.use("*", honoLogger());

// Health endpoint is public (used by uptime checks / load balancers)
app.route("/", healthRoutes);

// All other routes require the bridge API key
app.use("/api/*", bearerAuth);
app.route("/", smppRoutes);
app.route("/", smsRoutes);
app.route("/", queueRoutes);
app.route("/", campaignRoutes);
app.route("/", webhookRoutes);
app.route("/", reportRoutes);

// Error handler
app.onError((err, c) => {
  logger.error({ err: err.message, path: c.req.path }, "Unhandled error");
  return c.json({ error: "Internal server error" }, 500);
});

// --- Bootstrap ---

registerShutdownHandlers();

// Start SMPP connection + wire DLR handling
try {
  getSmppClient();
  wireDeliveryReceiptHandling();
  logger.info("SMPP client initialized");
} catch (err) {
  logger.warn({ err: (err as Error).message }, "SMPP client initialization deferred (env may be missing)");
}

// Start BullMQ workers
try {
  startSmsWorker();
  startCampaignWorker();
  startWebhooksWorker();
  logger.info("BullMQ workers started");
} catch (err) {
  logger.warn({ err: (err as Error).message }, "Worker start deferred");
}

// Start HTTP server
serve({
  fetch: app.fetch,
  port: env.BRIDGE_PORT,
}, (info) => {
  logger.info({ port: info.port }, "SMPP Bridge listening");
});
