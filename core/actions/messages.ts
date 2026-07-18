"use server";

import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import type { Prisma, MessageStatus, DlrStatus, MessageDirection } from "@/app/generated/prisma/client";

export interface MessageFilters {
  search?: string;
  status?: MessageStatus | MessageStatus[];
  dlrStatus?: DlrStatus | DlrStatus[];
  direction?: MessageDirection;
  connectorId?: string;
  providerId?: string;
  campaignId?: string;
  /** ISO date string (inclusive lower bound on createdAt) */
  from?: string;
  /** ISO date string (inclusive upper bound on createdAt) */
  to?: string;
}

export interface ListMessagesParams {
  cursor?: string | null;
  limit?: number;
  filters?: MessageFilters;
}

function buildWhere(organizationId: string, filters: MessageFilters | undefined): Prisma.SmsMessageWhereInput {
  const where: Prisma.SmsMessageWhereInput = { organizationId };
  if (!filters) return where;

  if (filters.search) {
    const q = filters.search.trim();
    where.OR = [
      { content: { contains: q, mode: "insensitive" } },
      { destinationAddr: { contains: q } },
      { sourceAddr: { contains: q, mode: "insensitive" } },
      { providerMessageId: { contains: q } },
    ];
  }
  if (filters.status) {
    where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
  }
  if (filters.dlrStatus) {
    where.dlrStatus = Array.isArray(filters.dlrStatus) ? { in: filters.dlrStatus } : filters.dlrStatus;
  }
  if (filters.direction) where.direction = filters.direction;
  if (filters.connectorId) where.connectorId = filters.connectorId;
  if (filters.providerId) where.providerId = filters.providerId;
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }
  return where;
}

export async function listMessagesAction(params: ListMessagesParams = {}) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const where = buildWhere(g.ctx.organizationId, params.filters);

  const messages = await prisma.smsMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    include: {
      provider: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  let nextCursor: string | null = null;
  if (messages.length > limit) {
    const last = messages.pop()!;
    nextCursor = last.id;
  }

  return { ok: true as const, data: messages, nextCursor };
}

export async function getMessageAction(id: string) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const m = await prisma.smsMessage.findFirst({
    where: { id, organizationId: g.ctx.organizationId },
    include: {
      provider: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      contact: true,
      template: { select: { id: true, name: true } },
    },
  });
  if (!m) return { ok: false as const, error: "Message introuvable." };
  return { ok: true as const, data: m };
}

export async function getMessageStatusCountsAction(filters?: MessageFilters) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const where = buildWhere(g.ctx.organizationId, filters);
  const grouped = await prisma.smsMessage.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;
  return { ok: true as const, counts };
}

export async function exportMessagesAction(filters?: MessageFilters) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const where = buildWhere(g.ctx.organizationId, filters);

  const rows = await prisma.smsMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100_000,
    include: {
      provider: { select: { name: true } },
      campaign: { select: { name: true } },
    },
  });

  const header = [
    "id", "createdAt", "direction", "sourceAddr", "destinationAddr", "content",
    "status", "dlrStatus", "encoding", "segments", "provider", "campaign",
    "sentAt", "deliveredAt", "cost", "providerMessageId",
  ];
  const escape = (v: unknown) => `\"${String(v ?? "").replace(/\"/g, '\"\"')}\"`;
  const lines = [header.join(",")];
  for (const m of rows) {
    lines.push([
      m.id,
      m.createdAt.toISOString(),
      m.direction,
      m.sourceAddr,
      m.destinationAddr,
      m.content,
      m.status,
      m.dlrStatus ?? "",
      m.encoding,
      m.segments,
      m.provider?.name ?? "",
      m.campaign?.name ?? "",
      m.sentAt?.toISOString() ?? "",
      m.deliveredAt?.toISOString() ?? "",
      m.cost?.toString() ?? "",
      m.providerMessageId ?? "",
    ].map(escape).join(","));
  }
  return { ok: true as const, csv: "\uFEFF" + lines.join("\n"), count: rows.length };
}

/**
 * Lightweight full-text search on the message content column. Postgres
 * GIN index can be added later via a Prisma migration; the ILIKE-based
 * query already benefits from B-tree on (organizationId, createdAt).
 */
export async function fullTextSearchAction(query: string, limit = 50) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!query.trim()) return { ok: true as const, data: [] };
  try {
    const rows = await prisma.smsMessage.findMany({
      where: {
        organizationId: g.ctx.organizationId,
        content: { contains: query.trim(), mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      include: { provider: { select: { name: true } } },
    });
    return { ok: true as const, data: rows };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "fullTextSearchAction failed");
    return { ok: false as const, error: "Search failed." };
  }
}
