"use server";

import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import type { Prisma } from "@/app/generated/prisma/client";

export interface AuditFilters {
  userEmail?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

function buildWhere(orgId: string, f?: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { organizationId: orgId };
  if (!f) return where;
  if (f.userEmail) where.userEmail = { contains: f.userEmail, mode: "insensitive" };
  if (f.action) where.action = f.action;
  if (f.entity) where.entity = f.entity;
  if (f.entityId) where.entityId = f.entityId;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(f.from) } : {}),
      ...(f.to ? { lte: new Date(f.to) } : {}),
    };
  }
  return where;
}

export async function listAuditLogsAction(opts?: { filters?: AuditFilters; cursor?: string | null; limit?: number }) {
  const g = await requirePermission("audit:view");
  if (!g.ok) return { ok: false as const, data: [], error: g.error };

  const where = buildWhere(g.ctx.organizationId, opts?.filters);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts?.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
  let nextCursor: string | null = null;
  if (rows.length > limit) nextCursor = rows.pop()!.id;
  return { ok: true as const, data: rows, nextCursor };
}

export async function exportAuditCsvAction(filters?: AuditFilters) {
  const g = await requirePermission("audit:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    const rows = await prisma.auditLog.findMany({
      where: buildWhere(g.ctx.organizationId, filters),
      orderBy: { createdAt: "desc" },
      take: 100_000,
    });
    const escape = (v: unknown) => `\"${String(v ?? "").replace(/\"/g, '\"\"')}\"`;
    const lines = [["createdAt", "action", "entity", "entityId", "userEmail", "ipAddress", "details"].join(",")];
    for (const r of rows) {
      lines.push([
        r.createdAt.toISOString(), r.action, r.entity, r.entityId ?? "",
        r.userEmail ?? "", r.ipAddress ?? "",
        r.details ? JSON.stringify(r.details) : "",
      ].map(escape).join(","));
    }
    return { ok: true as const, csv: "\uFEFF" + lines.join("\n") };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "exportAuditCsvAction failed");
    return { ok: false as const, error: "Erreur." };
  }
}
