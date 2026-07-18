import { Hono } from "hono";
import { getSmppClientIfExists } from "../lib/smpp/instance.js";
import { getAlertManager } from "../lib/smpp/alerts.js";
import { getRedisClient } from "../lib/queue/redis.js";

const health = new Hono();

health.get("/health", async (c) => {
  const smppClient = getSmppClientIfExists();
  const smppState = smppClient?.getState() ?? "not_initialized";
  const smppHealth = getAlertManager().getHealthStatus();

  let redisOk = false;
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    redisOk = pong === "PONG";
  } catch {
    redisOk = false;
  }

  const healthy = smppHealth.healthy && redisOk;

  return c.json({
    status: healthy ? "healthy" : "degraded",
    smpp: {
      state: smppState,
      healthy: smppHealth.healthy,
      reason: smppHealth.reason,
    },
    redis: { connected: redisOk },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }, healthy ? 200 : 503);
});

export default health;
