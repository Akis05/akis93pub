"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";

export interface GroupFormInput {
  name: string;
  description?: string;
  color?: string;
  isDynamic?: boolean;
  dynamicRules?: Record<string, unknown> | null;
}

export interface DynamicRules {
  /** Match any of the listed tags */
  anyTags?: string[];
  /** Match all of the listed tags */
  allTags?: string[];
  /** Match a single country code (e.g. "DJ") */
  country?: string;
  /** Exclude blacklisted contacts (default: true) */
  excludeBlacklisted?: boolean;
}

// ---------- LIST ----------
export async function listGroupsAction() {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const groups = await prisma.contactGroup.findMany({
    where: { organizationId: g.ctx.organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });

  const data = await Promise.all(
    groups.map(async (gp) => {
      let dynamicCount: number | null = null;
      if (gp.isDynamic && gp.dynamicRules) {
        try {
          const ids = await resolveDynamicGroupContactIds(g.ctx.organizationId, gp.dynamicRules as DynamicRules);
          dynamicCount = ids.length;
        } catch {
          dynamicCount = null;
        }
      }
      return {
        id: gp.id,
        name: gp.name,
        description: gp.description,
        color: gp.color,
        isDynamic: gp.isDynamic,
        dynamicRules: gp.dynamicRules,
        memberCount: gp.isDynamic ? (dynamicCount ?? 0) : gp._count.members,
        createdAt: gp.createdAt,
      };
    })
  );
  return { success: true as const, data };
}

// ---------- CREATE ----------
export async function createGroupAction(input: GroupFormInput) {
  const g = await requirePermission("contacts:create");
  if (!g.ok) return { success: false as const, error: g.error };

  try {
    if (!input.name?.trim()) return { success: false as const, error: "Le nom est requis." };

    const existing = await prisma.contactGroup.findFirst({
      where: { organizationId: g.ctx.organizationId, name: input.name, deletedAt: null },
    });
    if (existing) return { success: false as const, error: "Un groupe portant ce nom existe d\u00e9j\u00e0." };

    const group = await prisma.contactGroup.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color || "#3B82F6",
        isDynamic: input.isDynamic ?? false,
        dynamicRules: (input.dynamicRules ?? undefined) as never,
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/contacts/groups");
    return { success: true as const, data: group };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to create group");
    return { success: false as const, error: "Erreur lors de la cr\u00e9ation." };
  }
}

// ---------- UPDATE ----------
export async function updateGroupAction(id: string, input: GroupFormInput) {
  const g = await requirePermission("contacts:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.contactGroup.findUnique({
      where: { id }, select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Groupe introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    const group = await prisma.contactGroup.update({
      where: { id },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color || "#3B82F6",
        isDynamic: input.isDynamic ?? false,
        dynamicRules: (input.dynamicRules ?? undefined) as never,
      },
    });
    revalidatePath("/contacts/groups");
    return { success: true as const, data: group };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to update group");
    return { success: false as const, error: "Erreur." };
  }
}

// ---------- DELETE ----------
export async function deleteGroupAction(id: string) {
  const g = await requirePermission("contacts:delete");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.contactGroup.findUnique({
      where: { id }, select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Groupe introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.contactGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/contacts/groups");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to delete group");
    return { success: false as const, error: "Erreur." };
  }
}

// ---------- MEMBERS ----------
export async function getGroupMembersAction(groupId: string) {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const target = await prisma.contactGroup.findUnique({
    where: { id: groupId },
    select: { organizationId: true, isDynamic: true, dynamicRules: true },
  });
  if (!target) return { success: false as const, data: [], error: "Groupe introuvable." };
  assertSameOrg(g.ctx, target.organizationId);

  if (target.isDynamic && target.dynamicRules) {
    const ids = await resolveDynamicGroupContactIds(g.ctx.organizationId, target.dynamicRules as DynamicRules);
    if (ids.length === 0) return { success: true as const, data: [] };
    const contacts = await prisma.contact.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "desc" },
    });
    return {
      success: true as const,
      data: contacts.map((c) => ({
        id: c.id, phone: c.phone, firstName: c.firstName, lastName: c.lastName,
        addedAt: c.createdAt,
      })),
    };
  }

  const members = await prisma.contactGroupMember.findMany({
    where: { groupId },
    include: { contact: true },
    orderBy: { addedAt: "desc" },
  });
  return {
    success: true as const,
    data: members
      .filter((m) => !m.contact.deletedAt)
      .map((m) => ({
        id: m.contact.id, phone: m.contact.phone,
        firstName: m.contact.firstName, lastName: m.contact.lastName,
        addedAt: m.addedAt,
      })),
  };
}

export async function addMembersToGroupAction(groupId: string, contactIds: string[]) {
  const g = await requirePermission("contacts:update");
  if (!g.ok) return { success: false as const, added: 0, error: g.error };
  try {
    const group = await prisma.contactGroup.findFirst({
      where: { id: groupId, organizationId: g.ctx.organizationId, deletedAt: null },
    });
    if (!group) return { success: false as const, added: 0, error: "Groupe introuvable." };

    const result = await prisma.contactGroupMember.createMany({
      data: contactIds.map((contactId) => ({ contactId, groupId })),
      skipDuplicates: true,
    });
    revalidatePath("/contacts/groups");
    return { success: true as const, added: result.count };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to add members");
    return { success: false as const, added: 0, error: "Erreur." };
  }
}

export async function removeMembersFromGroupAction(groupId: string, contactIds: string[]) {
  const g = await requirePermission("contacts:update");
  if (!g.ok) return { success: false as const, removed: 0, error: g.error };
  try {
    const result = await prisma.contactGroupMember.deleteMany({
      where: { groupId, contactId: { in: contactIds } },
    });
    revalidatePath("/contacts/groups");
    return { success: true as const, removed: result.count };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to remove members");
    return { success: false as const, removed: 0, error: "Erreur." };
  }
}

// ---------- DYNAMIC RULES RESOLVER ----------
export async function resolveDynamicGroupContactIds(
  organizationId: string,
  rules: DynamicRules
): Promise<string[]> {
  const excludeBlacklisted = rules.excludeBlacklisted !== false;
  const where: Record<string, unknown> = {
    organizationId,
    deletedAt: null,
    ...(excludeBlacklisted ? { isBlacklisted: false } : {}),
  };
  if (rules.country) where.country = rules.country;
  if (rules.anyTags && rules.anyTags.length > 0) where.tags = { hasSome: rules.anyTags };
  if (rules.allTags && rules.allTags.length > 0) {
    where.tags = { ...(where.tags ?? {}), hasEvery: rules.allTags };
  }
  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true },
    take: 100_000,
  });
  return contacts.map((c) => c.id);
}

/**
 * Resolve the effective contact list for a group (static OR dynamic).
 * Used by the campaign execution engine.
 */
export async function resolveGroupContactsAction(groupId: string): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return { ok: false, error: g.error };

  const group = await prisma.contactGroup.findUnique({
    where: { id: groupId },
    select: { organizationId: true, isDynamic: true, dynamicRules: true },
  });
  if (!group) return { ok: false, error: "Groupe introuvable." };
  assertSameOrg(g.ctx, group.organizationId);

  if (group.isDynamic && group.dynamicRules) {
    const ids = await resolveDynamicGroupContactIds(g.ctx.organizationId, group.dynamicRules as DynamicRules);
    return { ok: true, ids };
  }
  const members = await prisma.contactGroupMember.findMany({
    where: { groupId, contact: { deletedAt: null, isBlacklisted: false } },
    select: { contactId: true },
  });
  return { ok: true, ids: members.map((m) => m.contactId) };
}

/**
 * Returns the union of contact ids belonging to the listed exclusion groups
 * (used by the campaign engine to exclude opt-out / suppression lists).
 */
export async function listExcludedContactsForCampaignAction(
  exclusionGroupIds: string[]
): Promise<string[]> {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return [];
  if (exclusionGroupIds.length === 0) return [];

  const groups = await prisma.contactGroup.findMany({
    where: { id: { in: exclusionGroupIds }, organizationId: g.ctx.organizationId },
    select: { id: true, isDynamic: true, dynamicRules: true },
  });

  const allIds = new Set<string>();
  for (const grp of groups) {
    if (grp.isDynamic && grp.dynamicRules) {
      const ids = await resolveDynamicGroupContactIds(g.ctx.organizationId, grp.dynamicRules as DynamicRules);
      ids.forEach((id) => allIds.add(id));
    } else {
      const members = await prisma.contactGroupMember.findMany({
        where: { groupId: grp.id },
        select: { contactId: true },
      });
      members.forEach((m) => allIds.add(m.contactId));
    }
  }

  // Also exclude every globally blacklisted contact
  const blacklisted = await prisma.contact.findMany({
    where: { organizationId: g.ctx.organizationId, isBlacklisted: true },
    select: { id: true },
  });
  blacklisted.forEach((c) => allIds.add(c.id));

  return Array.from(allIds);
}
