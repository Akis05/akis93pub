"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission, requireRole } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";
import type { SenderIdType } from "@/app/generated/prisma/client";

export interface SenderIdFormInput {
  name: string;
  type?: SenderIdType;
  providerId?: string | null;
}

/** List all sender ids (any approval status) for the management page. */
export async function listSenderIdsAction() {
  const g = await requirePermission("senderIds:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const rows = await prisma.senderId.findMany({
    where: { organizationId: g.ctx.organizationId, deletedAt: null },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { provider: { select: { id: true, name: true } } },
  });
  return { success: true as const, data: rows };
}

/** List APPROVED sender ids only — used by send forms / wizards. */
export async function listApprovedSenderIdsAction() {
  const g = await requirePermission("senderIds:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const rows = await prisma.senderId.findMany({
    where: {
      organizationId: g.ctx.organizationId,
      deletedAt: null,
      status: "APPROVED",
    },
    orderBy: { name: "asc" },
  });
  return { success: true as const, data: rows };
}

export async function createSenderIdAction(input: SenderIdFormInput) {
  const g = await requirePermission("senderIds:create");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    if (!input.name?.trim()) return { success: false as const, error: "Le nom est requis." };
    if (input.name.length > 11 && (input.type ?? "ALPHANUMERIC") === "ALPHANUMERIC") {
      return { success: false as const, error: "Un sender ID alphanum\u00e9rique fait au max 11 caract\u00e8res." };
    }

    const existing = await prisma.senderId.findFirst({
      where: { organizationId: g.ctx.organizationId, name: input.name, deletedAt: null },
    });
    if (existing) return { success: false as const, error: "Un sender ID portant ce nom existe d\u00e9j\u00e0." };

    const sender = await prisma.senderId.create({
      data: {
        name: input.name.trim(),
        type: input.type ?? "ALPHANUMERIC",
        status: "PENDING",
        providerId: input.providerId ?? null,
        organizationId: g.ctx.organizationId,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "create", entity: "senderId", entityId: sender.id,
        userId: g.ctx.userId, userEmail: g.ctx.email,
        details: { name: input.name, type: input.type ?? "ALPHANUMERIC" },
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/sender-ids");
    return { success: true as const, data: sender };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "createSenderIdAction failed");
    return { success: false as const, error: "Erreur lors de la cr\u00e9ation." };
  }
}

export async function approveSenderIdAction(id: string) {
  // Approval restricted to SUPER_ADMIN (per the plan).
  const g = await requireRole("SUPER_ADMIN");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.senderId.findUnique({
      where: { id }, select: { organizationId: true, name: true },
    });
    if (!target) return { success: false as const, error: "Sender ID introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.senderId.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date(), rejectedReason: null },
    });
    await prisma.auditLog.create({
      data: {
        action: "approve", entity: "senderId", entityId: id,
        userId: g.ctx.userId, userEmail: g.ctx.email,
        details: { name: target.name },
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/sender-ids");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "approveSenderIdAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function rejectSenderIdAction(id: string, reason: string) {
  const g = await requireRole("SUPER_ADMIN");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.senderId.findUnique({
      where: { id }, select: { organizationId: true, name: true },
    });
    if (!target) return { success: false as const, error: "Sender ID introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.senderId.update({
      where: { id },
      data: { status: "REJECTED", rejectedReason: reason || "Refus\u00e9" },
    });
    await prisma.auditLog.create({
      data: {
        action: "reject", entity: "senderId", entityId: id,
        userId: g.ctx.userId, userEmail: g.ctx.email,
        details: { name: target.name, reason },
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/sender-ids");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "rejectSenderIdAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function deleteSenderIdAction(id: string) {
  const g = await requirePermission("senderIds:delete");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.senderId.findUnique({
      where: { id }, select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Sender ID introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.senderId.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/sender-ids");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "deleteSenderIdAction failed");
    return { success: false as const, error: "Erreur." };
  }
}
