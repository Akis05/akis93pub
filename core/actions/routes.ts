"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";

export interface RouteRule {
  /** Destination prefix to match against the bare destination address, e.g. "253" */
  destinationPrefix?: string;
  /** ISO country code derived from the prefix (e.g. "DJ") */
  country?: string;
  /** Tag carried on the contact, when known */
  tag?: string;
}

export interface RouteFormInput {
  name: string;
  priority?: number;
  isActive?: boolean;
  isDefault?: boolean;
  rules?: RouteRule[];
  providerId?: string | null;
}

export async function listRoutesAction() {
  const g = await requirePermission("routes:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const rows = await prisma.smsRoute.findMany({
    where: { organizationId: g.ctx.organizationId, deletedAt: null },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: {
      provider: { select: { id: true, name: true } },
    },
  });
  return { success: true as const, data: rows };
}

export async function createRouteAction(input: RouteFormInput) {
  const g = await requirePermission("routes:create");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    if (!input.name?.trim()) return { success: false as const, error: "Le nom est requis." };

    const route = await prisma.smsRoute.create({
      data: {
        name: input.name.trim(),
        priority: input.priority ?? 0,
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? false,
        rules: (input.rules ?? []) as never,
        providerId: input.providerId ?? null,
        organizationId: g.ctx.organizationId,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "create", entity: "route", entityId: route.id,
        userId: g.ctx.userId, userEmail: g.ctx.email,
        details: { name: input.name, priority: input.priority ?? 0 },
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/routes");
    return { success: true as const, data: route };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "createRouteAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function updateRouteAction(id: string, input: Partial<RouteFormInput>) {
  const g = await requirePermission("routes:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.smsRoute.findUnique({
      where: { id }, select: { organizationId: true, name: true },
    });
    if (!target) return { success: false as const, error: "Route introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    const before = await prisma.smsRoute.findUnique({ where: { id } });
    const route = await prisma.smsRoute.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        priority: input.priority,
        isActive: input.isActive,
        isDefault: input.isDefault,
        rules: input.rules !== undefined ? (input.rules as never) : undefined,
        providerId: input.providerId !== undefined ? input.providerId : undefined,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "update", entity: "route", entityId: id,
        userId: g.ctx.userId, userEmail: g.ctx.email,
        details: { before, after: route },
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/routes");
    return { success: true as const, data: route };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "updateRouteAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function deleteRouteAction(id: string) {
  const g = await requirePermission("routes:delete");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.smsRoute.findUnique({
      where: { id }, select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Route introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.smsRoute.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/routes");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "deleteRouteAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

/**
 * Pure routing engine: given a destination, returns the highest-priority
 * active route that matches. A route matches when any of its rules matches.
 * If no rule is provided, the route only fires when `isDefault = true`.
 */
function matches(destinationE164: string, rules: RouteRule[]): boolean {
  if (!rules || rules.length === 0) return false;
  const bare = destinationE164.replace(/^\+/, "");
  for (const r of rules) {
    if (r.destinationPrefix && bare.startsWith(r.destinationPrefix.replace(/^\+/, ""))) return true;
    if (r.country && deriveCountryFromPrefix(bare) === r.country) return true;
  }
  return false;
}

function deriveCountryFromPrefix(bare: string): string | null {
  if (bare.startsWith("253")) return "DJ";
  if (bare.startsWith("33")) return "FR";
  if (bare.startsWith("251")) return "ET";
  if (bare.startsWith("254")) return "KE";
  if (bare.startsWith("44")) return "GB";
  if (bare.startsWith("971")) return "AE";
  if (bare.startsWith("966")) return "SA";
  if (bare.startsWith("1")) return "US";
  return null;
}

/**
 * Resolve a connector for an outbound destination, scoped to the org.
 * Picks the highest-priority matching active route; falls back to the
 * default route, then to the first BOUND connector.
 */
export async function resolveRouteForDestination(
  organizationId: string,
  destinationE164: string
): Promise<{ providerId: string | null; routeId: string | null }> {
  const routes = await prisma.smsRoute.findMany({
    where: { organizationId, deletedAt: null, isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  for (const r of routes) {
    if (matches(destinationE164, (r.rules as RouteRule[]) ?? [])) {
      return { providerId: r.providerId, routeId: r.id };
    }
  }
  const defaultRoute = routes.find((r) => r.isDefault);
  if (defaultRoute) {
    return { providerId: defaultRoute.providerId, routeId: defaultRoute.id };
  }

  return { providerId: null, routeId: null };
}

/**
 * Server action used by the /routes "test" panel.
 * Returns which route would fire for a given destination.
 */
export async function evaluateRouteAction(destinationE164: string) {
  const g = await requirePermission("routes:view");
  if (!g.ok) return { success: false as const, error: g.error };
  if (!destinationE164.startsWith("+")) {
    return { success: false as const, error: "Le num\u00e9ro doit \u00eatre au format E.164 (commence par +)." };
  }
  const result = await resolveRouteForDestination(g.ctx.organizationId, destinationE164);
  return { success: true as const, ...result };
}
