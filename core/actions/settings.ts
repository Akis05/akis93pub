"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";

export interface OrganizationSettingsInput {
  name?: string;
  logo?: string | null;
  timezone?: string;
}

export async function getOrganizationSettingsAction() {
  const g = await requirePermission("settings:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const org = await prisma.organization.findUnique({
    where: { id: g.ctx.organizationId },
    select: {
      id: true, name: true, slug: true, logo: true, timezone: true,
      createdAt: true,
    },
  });
  if (!org) return { ok: false as const, error: "Organisation introuvable." };
  return { ok: true as const, data: org };
}

export async function updateOrganizationSettingsAction(input: OrganizationSettingsInput) {
  const g = await requirePermission("settings:update");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    const before = await prisma.organization.findUnique({
      where: { id: g.ctx.organizationId },
      select: { name: true, logo: true, timezone: true },
    });

    const org = await prisma.organization.update({
      where: { id: g.ctx.organizationId },
      data: {
        name: input.name?.trim(),
        logo: input.logo === undefined ? undefined : input.logo,
        timezone: input.timezone,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "update", entity: "organization", entityId: org.id,
        userId: g.ctx.userId, userEmail: g.ctx.email,
        details: { before, after: { name: org.name, logo: org.logo, timezone: org.timezone } },
        organizationId: org.id,
      },
    });
    revalidatePath("/settings");
    return { ok: true as const, data: org };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "updateOrganizationSettingsAction failed");
    return { ok: false as const, error: "Erreur lors de la mise \u00e0 jour." };
  }
}
