import { logger } from "./logger.js";

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Graceful shutdown: starting");

  const results = await Promise.allSettled([
    import("./queue/sms-queue.js").then((m) => m.shutdownSmsQueue()),
    import("./queue/campaign-queue.js").then((m) => m.getCampaignQueue().close()),
    import("./queue/webhooks-queue.js").then((m) => m.getWebhooksQueue().close()),
    import("./smpp/session-manager.js").then((m) => m.sessionManager.disconnectAll()),
  ]);

  for (const r of results) {
    if (r.status === "rejected") {
      logger.warn({ err: r.reason instanceof Error ? r.reason.message : r.reason }, "Graceful shutdown: a step failed");
    }
  }

  try {
    const { destroyRateLimiter } = await import("./smpp/rate-limiter.js");
    destroyRateLimiter();
    const { destroyAlertManager } = await import("./smpp/alerts.js");
    destroyAlertManager();
    const { getRedisClient } = await import("./queue/redis.js");
    await getRedisClient().quit();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Graceful shutdown: singleton teardown failed");
  }

  logger.info({ signal }, "Graceful shutdown: complete");
}

let _registered = false;

export function registerShutdownHandlers(): void {
  if (_registered) return;
  _registered = true;

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void shutdown(signal).finally(() => process.exit(0));
    });
  }
}
