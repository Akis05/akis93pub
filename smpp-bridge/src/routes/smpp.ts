import { Hono } from "hono";
import * as smpp from "smpp";
import { sessionManager } from "../lib/smpp/session-manager.js";
import { getSmppClient, getSmppClientIfExists } from "../lib/smpp/instance.js";
import { getAlertManager } from "../lib/smpp/alerts.js";
import { querySmsStatus } from "../lib/smpp/query-sm.js";
import { logger } from "../lib/logger.js";

const smppRoutes = new Hono();

smppRoutes.get("/api/v1/smpp/status", (c) => {
  const snapshots = sessionManager.snapshot();
  const metrics = getAlertManager().getMetrics();
  const health = getAlertManager().getHealthStatus();

  return c.json({
    sessions: snapshots,
    metrics: {
      totalSent: metrics.totalSent,
      totalDelivered: metrics.totalDelivered,
      totalFailed: metrics.totalFailed,
      totalErrors: metrics.totalErrors,
      disconnections: metrics.disconnections,
      sessionState: metrics.sessionState,
    },
    healthy: health.healthy,
    reason: health.reason,
  });
});

smppRoutes.post("/api/v1/smpp/connect", async (c) => {
  const existing = getSmppClientIfExists();
  if (existing && existing.getState() === "bound") {
    return c.json({ message: "Already connected", state: "bound" });
  }
  getSmppClient();
  return c.json({ message: "Connection initiated", state: "connecting" });
});

smppRoutes.post("/api/v1/smpp/disconnect", async (c) => {
  const disconnected = await sessionManager.disconnect();
  return c.json({
    message: disconnected ? "Disconnected" : "No active session",
    disconnected,
  });
});

smppRoutes.post("/api/v1/smpp/restart", async (c) => {
  const client = getSmppClient();
  if (client.getState() !== "disconnected") {
    await client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  client.connect();
  return c.json({ message: "Restart initiated", state: client.getState() });
});

smppRoutes.get("/api/v1/smpp/query", async (c) => {
  const messageId = c.req.query("id")?.trim();
  if (!messageId) {
    return c.json({ error: "Query param 'id' is required" }, 400);
  }
  const sourceAddr = c.req.query("from")?.trim() || undefined;
  try {
    const result = await querySmsStatus(messageId, { sourceAddr });
    return c.json({ success: true, data: result });
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ err: message, messageId }, "query_sm request failed");
    const status = message.includes("timeout") ? 504 : message.includes("bind") ? 503 : 502;
    return c.json({ success: false, error: message }, status);
  }
});

/**
 * Opens a throwaway SMPP session (independent from the shared session
 * managed by SmppSessionManager) purely to verify a set of credentials and
 * measure bind latency. Used by the "test connector" diagnostic action.
 */
smppRoutes.post("/api/v1/smpp/test-bind", async (c) => {
  const body = await c.req.json();
  const { host, port, systemId, password, systemType, bindMode, useTls } = body as {
    host: string; port: number; systemId: string; password: string;
    systemType?: string; bindMode?: string; useTls?: boolean;
  };

  if (!host || !port || !systemId || !password) {
    return c.json({ success: false, error: "host, port, systemId, password are required" }, 400);
  }

  const start = Date.now();
  return new Promise<Response>((resolve) => {
    const timeout = setTimeout(() => {
      resolve(c.json({ success: false, status: "timeout", latencyMs: Date.now() - start, error: "Timeout après 10s" }));
    }, 10000);

    const session = smpp.connect({ host, port, tls: !!useTls }, () => {
      const method = bindMode === "TRANSMITTER" ? "bind_transmitter"
        : bindMode === "RECEIVER" ? "bind_receiver" : "bind_transceiver";

      session[method]({
        system_id: systemId, password, system_type: systemType ?? "", interface_version: 0x34,
      }, (pdu) => {
        clearTimeout(timeout);
        const latencyMs = Date.now() - start;
        if (pdu.command_status === 0) {
          session.unbind(() => session.close());
          resolve(c.json({ success: true, status: "bound", latencyMs }));
        } else {
          const errorHex = `0x${pdu.command_status.toString(16)}`;
          session.close();
          resolve(c.json({ success: false, status: "error", latencyMs, error: `Bind failed: ${errorHex}` }));
        }
      });
    });

    session.on("error", (err: Error) => {
      clearTimeout(timeout);
      resolve(c.json({ success: false, status: "error", latencyMs: Date.now() - start, error: err.message }));
    });
  });
});

export default smppRoutes;
