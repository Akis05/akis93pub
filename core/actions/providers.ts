"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";
import type { ProviderType } from "@/app/generated/prisma/client";

export interface ProviderFormInput {
  name: string;
  type?: ProviderType;
  country?: string | null;
  isActive?: boolean;
  config?: Record<string, unknown>;
}

export async function listProvidersAction() {
  const g = await requirePermission("providers:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const providers = await prisma.smsProvider.findMany({
    where: { organizationId: g.ctx.organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { connectors: { where: { deletedAt: null } }, messages: true } },
    },
  });

  // Compute lightweight stats per provider in one pass.
  const stats = await prisma.smsMessage.groupBy({
    by: ["providerId", "status"],
    where: { organizationId: g.ctx.organizationId, providerId: { not: null } },
    _count: { _all: true },
  });

  const data = providers.map((p) => {
    const rows = stats.filter((s) => s.providerId === p.id);
    const total = rows.reduce((sum, r) => sum + r._count._all, 0);
    const delivered = rows.find((r) => r.status === "DELIVERED")?._count._all ?? 0;
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      country: p.country,
      isActive: p.isActive,
      config: p.config,
      createdAt: p.createdAt,
      connectorCount: p._count.connectors,
      messageCount: p._count.messages,
      deliveryRate: total > 0 ? Math.round((delivered / total) * 1000) / 10 : 0,
    };
  });
  return { success: true as const, data };
}

export async function createProviderAction(input: ProviderFormInput) {
  const g = await requirePermission("providers:create");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    if (!input.name?.trim()) return { success: false as const, error: "Le nom est requis." };
    const existing = await prisma.smsProvider.findFirst({
      where: { organizationId: g.ctx.organizationId, name: input.name, deletedAt: null },
    });
    if (existing) return { success: false as const, error: "Un fournisseur portant ce nom existe d\u00e9j\u00e0." };

    const provider = await prisma.smsProvider.create({
      data: {
        name: input.name.trim(),
        type: input.type ?? "SMPP",
        country: input.country ?? null,
        isActive: input.isActive ?? true,
        config: (input.config ?? {}) as never,
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/providers");
    return { success: true as const, data: provider };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "createProviderAction failed");
    return { success: false as const, error: "Erreur lors de la cr\u00e9ation." };
  }
}

export async function updateProviderAction(id: string, input: Partial<ProviderFormInput>) {
  const g = await requirePermission("providers:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.smsProvider.findUnique({
      where: { id }, select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Fournisseur introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    const provider = await prisma.smsProvider.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        type: input.type,
        country: input.country,
        isActive: input.isActive,
        config: input.config !== undefined ? (input.config as never) : undefined,
      },
    });
    revalidatePath("/providers");
    return { success: true as const, data: provider };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "updateProviderAction failed");
    return { success: false as const, error: "Erreur lors de la mise \u00e0 jour." };
  }
}

export async function deleteProviderAction(id: string) {
  const g = await requirePermission("providers:delete");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.smsProvider.findUnique({
      where: { id }, select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Fournisseur introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.smsProvider.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/providers");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "deleteProviderAction failed");
    return { success: false as const, error: "Erreur." };
  }
}
