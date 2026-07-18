"use server";

import prisma from "@/core/lib/prisma";
import { requirePermission } from "@/core/lib/auth/role-guard";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * CDR (Call Detail Record) helpers for the SMPP account.
 *
 * These mirror the SMPP account capabilities:
 *   - Delivery state via DLR (DELIVRD / EXPIRED / UNDELIV / REJECTD / ACCEPTD)
 *   - "Store" (messages still waiting in the network/queue), bounded by the
 *     account Max validity of 7 days.
 */

// SMPP account "Max validity" = 7 days 0h 0m 0s.
export const MAX_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

// Statuses that mean the SMS is still "in store" (not yet finalised).
const STORE_STATUSES = ["PENDING", "QUEUED", "SENDING", "SENT"] as const;

export interface CdrRecord {
  messageId: string;
  providerMessageId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  from: string;
  to: string;
  content: string;
  encoding: string;
  segments: number;
  /** Internal gateway status */
  status: string;
  /** Raw SMPP DLR status (stat: field) */
  dlrStatus: string | null;
  /** Human-readable delivery state */
  delivered: boolean;
  errorCode: string | null;
  /** Still waiting in the network/queue */
  inStore: boolean;
  /** Age in the store (ms) and whether it exceeded Max validity (7 days) */
  storeAgeMs: number | null;
  expired: boolean;
  cost: string | null;
  campaignName: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  dlrReceivedAt: string | null;
}

function toCdr(m: {
  id: string;
  providerMessageId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  sourceAddr: string;
  destinationAddr: string;
  content: string;
  encoding: string;
  segments: number;
  status: string;
  dlrStatus: string | null;
  dlrErrorCode: string | null;
  cost: Prisma.Decimal | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  dlrReceivedAt: Date | null;
  campaign?: { name: string } | null;
}): CdrRecord {
  const inStore = (STORE_STATUSES as readonly string[]).includes(m.status);
  const reference = m.sentAt ?? m.createdAt;
  const storeAgeMs = inStore ? Date.now() - reference.getTime() : null;
  const expired = m.status === "EXPIRED" || (inStore && storeAgeMs !== null && storeAgeMs > MAX_VALIDITY_MS);
  return {
    messageId: m.id,
    providerMessageId: m.providerMessageId,
    direction: m.direction,
    from: m.sourceAddr,
    to: m.destinationAddr,
    content: m.content,
    encoding: m.encoding,
    segments: m.segments,
    status: m.status,
    dlrStatus: m.dlrStatus,
    delivered: m.status === "DELIVERED" || m.dlrStatus === "DELIVRD",
    errorCode: m.dlrErrorCode,
    inStore,
    storeAgeMs,
    expired,
    cost: m.cost ? m.cost.toString() : null,
    campaignName: m.campaign?.name ?? null,
    createdAt: m.createdAt.toISOString(),
    sentAt: m.sentAt?.toISOString() ?? null,
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    dlrReceivedAt: m.dlrReceivedAt?.toISOString() ?? null,
  };
}

const CDR_INCLUDE = {
  campaign: { select: { name: true } },
} satisfies Prisma.SmsMessageInclude;

/**
 * Full CDR for a single SMS, looked up by internal id OR by the SMSC
 * providerMessageId (the Message ID returned by the SMPP account).
 */
export async function getCdrAction(messageId: string) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const id = messageId.trim();
  if (!id) return { ok: false as const, error: "messageId requis." };

  const m = await prisma.smsMessage.findFirst({
    where: {
      organizationId: g.ctx.organizationId,
      OR: [{ id }, { providerMessageId: id }],
    },
    include: CDR_INCLUDE,
  });
  if (!m) return { ok: false as const, error: "SMS introuvable pour cet identifiant." };
  return { ok: true as const, data: toCdr(m) };
}

/**
 * Store statistics: how many SMS are still waiting (store), how many have
 * exceeded the 7-day Max validity, plus the oldest in-store message.
 */
export async function getStoreStatsAction() {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const where: Prisma.SmsMessageWhereInput = {
    organizationId: g.ctx.organizationId,
    direction: "OUTBOUND",
    status: { in: STORE_STATUSES as unknown as string[] },
  };

  const grouped = await prisma.smsMessage.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const byStatus: Record<string, number> = {};
  let inStore = 0;
  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
    inStore += row._count._all;
  }

  const validityCutoff = new Date(Date.now() - MAX_VALIDITY_MS);
  const expiredInStore = await prisma.smsMessage.count({
    where: { ...where, createdAt: { lt: validityCutoff } },
  });

  const oldest = await prisma.smsMessage.findFirst({
    where,
    orderBy: { createdAt: "asc" },
    select: { id: true, destinationAddr: true, status: true, createdAt: true },
  });

  return {
    ok: true as const,
    data: {
      inStore,
      byStatus,
      expiredInStore,
      maxValidityDays: 7,
      oldest: oldest
        ? {
            messageId: oldest.id,
            to: oldest.destinationAddr,
            status: oldest.status,
            createdAt: oldest.createdAt.toISOString(),
            ageMs: Date.now() - oldest.createdAt.getTime(),
          }
        : null,
    },
  };
}
