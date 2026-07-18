"use server";

import prisma from "@/core/lib/prisma";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { orgGuard } from "@/core/lib/auth/org-guard";
import { getSmppStatusFromBridge, smppTestBindViaBridge } from "@/core/lib/bridge-client";

const DEFAULT_SESSION_KEY = "__env__";

export interface EnvConnectorView {
  id: string;
  name: string;
  host: string;
  port: number;
  systemId: string;
  password: string;
  systemType: string | null;
  bindMode: string;
  useTls: boolean;
  enquireLinkInterval: number;
  reconnectDelay: number;
  maxTps: number;
  windowSize: number;
  sourceAddr: string;
  status: string;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastErrorMessage: string | null;
  organizationId: string;
  createdAt: string;
  isEnv: true;
}

/**
 * Build the single connector view from the .env SMPP config, enriched with
 * the live session state read from the SMPP Bridge. This is the connector
 * that is actually used to bind (DEFAULT_SESSION_KEY "__env__"); the page
 * reflects it read-only instead of editing a separate DB row.
 */
async function buildEnvConnector(): Promise<EnvConnectorView | null> {
  const host = process.env.SMPP_HOST;
  const systemId = process.env.SMPP_SYSTEM_ID;
  if (!host || !systemId) return null;

  let status = "DISCONNECTED";
  try {
    const bridgeStatus = await getSmppStatusFromBridge();
    const snapshot = bridgeStatus.sessions.find((s) => s.key === DEFAULT_SESSION_KEY);
    status = snapshot ? snapshot.state.toUpperCase() : "DISCONNECTED";
  } catch {
    // Bridge unavailable: leave status as DISCONNECTED
  }

  return {
    id: DEFAULT_SESSION_KEY,
    name: `${systemId}@${host} (.env)`,
    host,
    port: parseInt(process.env.SMPP_PORT ?? "2775", 10),
    systemId,
    password: process.env.SMPP_PASSWORD ?? "",
    systemType: process.env.SMPP_SYSTEM_TYPE ?? "",
    bindMode: (process.env.SMPP_BIND_MODE ?? "transceiver").toUpperCase(),
    useTls: process.env.SMPP_USE_TLS === "true",
    enquireLinkInterval: parseInt(process.env.SMPP_ENQUIRE_LINK_INTERVAL_MS ?? "30000", 10),
    reconnectDelay: parseInt(process.env.SMPP_RECONNECT_DELAY_MS ?? "5000", 10),
    maxTps: 100,
    windowSize: 10,
    sourceAddr: process.env.SMPP_SOURCE_ADDR ?? systemId,
    status,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastErrorMessage: null,
    organizationId: DEFAULT_SESSION_KEY,
    createdAt: new Date().toISOString(),
    isEnv: true,
  };
}

/**
 * Returns the connector(s) the gateway actually uses. The SMPP connection is
 * driven exclusively by the .env config, so this is the single source of
 * truth shown on the Connectors page (read-only).
 */
export async function listConnectorsAction() {
  const g = await requirePermission("connectors:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const env = await buildEnvConnector();
  return { success: true as const, data: env ? [env] : [] };
}

/**
 * Aggregate message stats for the .env connector. Since the .env connector
 * has no DB row, stats are computed org-wide (all messages sent through the
 * single configured SMSC).
 */
export async function getConnectorStatsAction(_connectorId?: string) {
  const g = await requirePermission("connectors:view");
  if (!g.ok) return { success: false as const, error: g.error };

  const grouped = await prisma.smsMessage.groupBy({
    by: ["status"],
    where: { organizationId: g.ctx.organizationId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const r of grouped) counts[r.status] = r._count._all;

  // Average latency submit -> DLR (in ms) on last 1000 delivered messages.
  const recent = await prisma.smsMessage.findMany({
    where: {
      organizationId: g.ctx.organizationId,
      status: "DELIVERED",
      sentAt: { not: null },
      deliveredAt: { not: null },
    },
    orderBy: { deliveredAt: "desc" },
    take: 1000,
    select: { sentAt: true, deliveredAt: true },
  });
  const avgLatencyMs = recent.length > 0
    ? Math.round(
        recent.reduce((sum, r) => sum + (r.deliveredAt!.getTime() - r.sentAt!.getTime()), 0) /
          recent.length
      )
    : 0;

  return { success: true as const, data: { counts, avgLatencyMs, sampleSize: recent.length } };
}

/**
 * Connector-related audit logs for the org (e.g. session start/stop events).
 */
export async function getConnectorLogsAction(_connectorId?: string, limit = 100) {
  const g = await requirePermission("connectors:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: g.ctx.organizationId, entity: "connector" },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: { id: true, action: true, userEmail: true, details: true, createdAt: true },
  });
  return { success: true as const, data: logs };
}

/**
 * Used by the send page. There is a single .env connector, returned as the
 * default selection.
 */
export async function getConnectorsForSendAction() {
  await orgGuard();
  const env = await buildEnvConnector();
  return {
    success: true as const,
    data: env ? [env] : [],
    defaultId: env?.id ?? null,
  };
}

/**
 * Test a real bind against the SMSC using the .env configuration, via the
 * SMPP Bridge's throwaway test-bind endpoint. Does not touch any DB row;
 * reflects exactly the credentials the gateway binds with.
 */
export async function testConnectorAction(_connectorId?: string) {
  const g = await requirePermission("connectors:view");
  if (!g.ok) return { success: false as const, status: "error" as const, error: g.error, latencyMs: 0 };

  const env = await buildEnvConnector();
  if (!env) {
    return { success: false as const, status: "error" as const, error: "Configuration .env SMPP absente (SMPP_HOST / SMPP_SYSTEM_ID).", latencyMs: 0 };
  }

  try {
    const result = await smppTestBindViaBridge({
      host: env.host,
      port: env.port,
      systemId: env.systemId,
      password: env.password,
      systemType: env.systemType ?? "",
      bindMode: env.bindMode,
      useTls: env.useTls,
    });
    return result;
  } catch (err) {
    return {
      success: false as const, status: "error" as const,
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
