"use server";

import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { getQueueStatsFromBridge, getSmppStatusFromBridge } from "@/core/lib/bridge-client";
import type { Prisma } from "@/app/generated/prisma/client";

const DEFAULT_SESSION_KEY = "__env__";

interface ConnectorStatus {
  id: string;
  name: string;
  host: string;
  port: number;
  status: string;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
}

function startOf(period: "24h" | "7d" | "30d", ref = new Date()): Date {
  const ms = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 }[period];
  return new Date(ref.getTime() - ms);
}

async function countMessages(organizationId: string, gte: Date, lt?: Date) {
  const where: Prisma.SmsMessageWhereInput = {
    organizationId,
    direction: "OUTBOUND",
    createdAt: { gte, ...(lt ? { lt } : {}) },
  };
  const total = await prisma.smsMessage.count({ where });
  const delivered = await prisma.smsMessage.count({
    where: { ...where, status: "DELIVERED" },
  });
  return { total, delivered };
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function getKpisAction() {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const orgId = g.ctx.organizationId;
  const now = new Date();

  try {
    const [last24h, prev24h, last7d, prev7d, last30d, prev30d] = await Promise.all([
      countMessages(orgId, startOf("24h", now), now),
      countMessages(orgId, startOf("24h", startOf("24h", now)), startOf("24h", now)),
      countMessages(orgId, startOf("7d", now), now),
      countMessages(orgId, startOf("7d", startOf("7d", now)), startOf("7d", now)),
      countMessages(orgId, startOf("30d", now), now),
      countMessages(orgId, startOf("30d", startOf("30d", now)), startOf("30d", now)),
    ]);

    // Cost over 30 days = sum of debits in CreditTransaction
    const creditBalance = await prisma.creditBalance.findUnique({
      where: { organizationId: orgId },
      select: { id: true, balance: true, alertThreshold: true },
    });
    let cost30d = 0;
    if (creditBalance) {
      const debits = await prisma.creditTransaction.aggregate({
        where: {
          balanceId: creditBalance.id,
          type: "DEBIT",
          createdAt: { gte: startOf("30d", now) },
        },
        _sum: { amount: true },
      });
      cost30d = Number(debits._sum.amount ?? 0);
    }

    // Queue depth, read from the SMPP Bridge (which owns the BullMQ queues)
    let queueDepth = 0;
    try {
      const c = await getQueueStatsFromBridge();
      queueDepth = (c.sms.waiting ?? 0) + (c.sms.delayed ?? 0) + (c.sms.active ?? 0);
    } catch {
      // Bridge unavailable: fall back to Prisma
      queueDepth = await prisma.smsMessage.count({
        where: { organizationId: orgId, status: { in: ["PENDING", "QUEUED", "SENDING"] } },
      });
    }

    // The SMPP connection is env-based (no smppConnector model). Derive the
    // active connector count from the live SMPP session state, read from
    // the bridge.
    let activeConnectors = 0;
    try {
      const bridgeStatus = await getSmppStatusFromBridge();
      const snapshot = bridgeStatus.sessions.find((s) => s.key === DEFAULT_SESSION_KEY);
      activeConnectors = snapshot && snapshot.state === "bound" ? 1 : 0;
    } catch {
      // Bridge unavailable: leave activeConnectors at 0
    }

    const deliveryRate30d = last30d.total > 0
      ? Math.round((last30d.delivered / last30d.total) * 1000) / 10
      : 0;

    return {
      ok: true as const,
      data: {
        sent24h: last24h.total,
        sent7d: last7d.total,
        sent30d: last30d.total,
        change24h: pctChange(last24h.total, prev24h.total),
        change7d: pctChange(last7d.total, prev7d.total),
        change30d: pctChange(last30d.total, prev30d.total),
        deliveryRate: deliveryRate30d,
        cost30d,
        creditsBalance: Number(creditBalance?.balance ?? 0),
        creditsAlertThreshold: Number(creditBalance?.alertThreshold ?? 0),
        queueDepth,
        activeConnectors,
      },
    };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "getKpisAction failed");
    return { ok: false as const, error: "Erreur lors du chargement des KPIs." };
  }
}

export async function getVolumeTimeseriesAction(days = 7) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const orgId = g.ctx.organizationId;
  const now = new Date();
  const start = new Date(now.getTime() - days * 86_400_000);

  // Aggregate per day using Prisma's grouping by date_trunc emulated client-side
  const rows = await prisma.smsMessage.findMany({
    where: {
      organizationId: orgId,
      direction: "OUTBOUND",
      createdAt: { gte: start },
    },
    select: { createdAt: true, status: true },
  });

  const buckets: Record<string, { sent: number; delivered: number; failed: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { sent: 0, delivered: 0, failed: 0 };
  }
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    if (!buckets[key]) continue;
    buckets[key].sent += 1;
    if (r.status === "DELIVERED") buckets[key].delivered += 1;
    else if (r.status === "FAILED" || r.status === "REJECTED" || r.status === "EXPIRED") {
      buckets[key].failed += 1;
    }
  }
  return {
    ok: true as const,
    data: Object.entries(buckets).map(([date, v]) => ({ date, ...v })),
  };
}

export async function getDlrBreakdownAction(days = 30) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const orgId = g.ctx.organizationId;
  const start = new Date(Date.now() - days * 86_400_000);

  const grouped = await prisma.smsMessage.groupBy({
    by: ["status"],
    where: { organizationId: orgId, direction: "OUTBOUND", createdAt: { gte: start } },
    _count: { _all: true },
  });
  return {
    ok: true as const,
    data: grouped.map((g) => ({ status: g.status, count: g._count._all })),
  };
}

export async function getTopCampaignsAction(limit = 5) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const orgId = g.ctx.organizationId;

  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: orgId, deletedAt: null, status: { in: ["RUNNING", "COMPLETED"] } },
    orderBy: [{ sentCount: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true, name: true, status: true,
      totalRecipients: true, sentCount: true, deliveredCount: true, failedCount: true,
    },
  });
  return {
    ok: true as const,
    data: campaigns.map((c) => ({
      ...c,
      deliveryRate: c.sentCount > 0
        ? Math.round((c.deliveredCount / c.sentCount) * 1000) / 10
        : 0,
    })),
  };
}

export async function getRecentAuditAction(limit = 10) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const rows = await prisma.auditLog.findMany({
    where: { organizationId: g.ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, action: true, entity: true, entityId: true,
      userEmail: true, details: true, createdAt: true,
    },
  });
  return { ok: true as const, data: rows };
}

export async function getConnectorStatusAction() {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  // The SMPP connection is configured exclusively via .env variables; there
  // is intentionally no DB-backed connector model. Reflect the single env
  // connector enriched with the live session state, read from the bridge.
  const host = process.env.SMPP_HOST;
  const systemId = process.env.SMPP_SYSTEM_ID;
  if (!host || !systemId) {
    return { ok: true as const, data: [] as ConnectorStatus[] };
  }

  let status = "DISCONNECTED";
  try {
    const bridgeStatus = await getSmppStatusFromBridge();
    const snapshot = bridgeStatus.sessions.find((s) => s.key === DEFAULT_SESSION_KEY);
    status = snapshot ? snapshot.state.toUpperCase() : "DISCONNECTED";
  } catch {
    // Bridge unavailable: leave status as DISCONNECTED
  }

  const data: ConnectorStatus[] = [
    {
      id: DEFAULT_SESSION_KEY,
      name: `${systemId}@${host} (.env)`,
      host,
      port: parseInt(process.env.SMPP_PORT ?? "2775", 10),
      status,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
    },
  ];
  return { ok: true as const, data };
}
