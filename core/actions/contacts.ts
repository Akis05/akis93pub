"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().\"]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

function detectCountry(phone: string): string | null {
  if (phone.startsWith("+253")) return "DJ";
  if (phone.startsWith("+33")) return "FR";
  if (phone.startsWith("+251")) return "ET";
  if (phone.startsWith("+254")) return "KE";
  if (phone.startsWith("+1")) return "US";
  if (phone.startsWith("+44")) return "GB";
  if (phone.startsWith("+971")) return "AE";
  if (phone.startsWith("+966")) return "SA";
  return null;
}

export interface ContactFormInput {
  phone: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
}

export interface ContactUpdateInput {
  firstName?: string | null;
  lastName?: string | null;
  tags?: string[];
  isBlacklisted?: boolean;
}

// ---------- LIST ----------
export async function listContactsAction(opts?: { search?: string; tag?: string; blacklisted?: boolean }) {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const where: Record<string, unknown> = {
    organizationId: g.ctx.organizationId,
    deletedAt: null,
  };
  if (typeof opts?.blacklisted === "boolean") where.isBlacklisted = opts.blacklisted;
  if (opts?.tag) where.tags = { has: opts.tag };
  if (opts?.search) {
    const q = opts.search.trim();
    where.OR = [
      { phone: { contains: q } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { tags: { has: q } },
    ];
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return { success: true as const, data: contacts };
}

// ---------- SEARCH (lightweight) ----------
export async function searchContactsAction(query: string, limit = 25) {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };
  if (!query.trim()) return { success: true as const, data: [] };

  const q = query.trim();
  const rows = await prisma.contact.findMany({
    where: {
      organizationId: g.ctx.organizationId,
      deletedAt: null,
      OR: [
        { phone: { contains: q } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
  return { success: true as const, data: rows };
}

// ---------- CREATE ----------
export async function createContactAction(input: ContactFormInput) {
  const g = await requirePermission("contacts:create");
  if (!g.ok) return { success: false as const, error: g.error };

  try {
    const phone = normalizePhone(input.phone);
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      return { success: false as const, error: "Num\u00e9ro de t\u00e9l\u00e9phone invalide (format E.164)." };
    }

    const existing = await prisma.contact.findFirst({
      where: { organizationId: g.ctx.organizationId, phone, deletedAt: null },
    });
    if (existing) return { success: false as const, error: "Ce num\u00e9ro existe d\u00e9j\u00e0 dans vos contacts." };

    const contact = await prisma.contact.create({
      data: {
        phone,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        country: detectCountry(phone),
        tags: input.tags ?? [],
        organizationId: g.ctx.organizationId,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "create",
        entity: "contact",
        entityId: contact.id,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { phone },
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/contacts");
    return { success: true as const, data: contact };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to create contact");
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { success: false as const, error: "Ce num\u00e9ro existe d\u00e9j\u00e0." };
    }
    return { success: false as const, error: "Erreur lors de la cr\u00e9ation." };
  }
}

// ---------- UPDATE ----------
export async function updateContactAction(contactId: string, input: ContactUpdateInput) {
  const g = await requirePermission("contacts:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Contact introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined,
        tags: input.tags ?? undefined,
        isBlacklisted: input.isBlacklisted ?? undefined,
      },
    });
    revalidatePath("/contacts");
    return { success: true as const, data: contact };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "updateContactAction failed");
    return { success: false as const, error: "Erreur lors de la mise \u00e0 jour." };
  }
}

// ---------- TOGGLE BLACKLIST (opt-out / opt-in) ----------
export async function toggleBlacklistAction(contactId: string, blacklisted: boolean) {
  const g = await requirePermission("contacts:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { organizationId: true, phone: true },
    });
    if (!target) return { success: false as const, error: "Contact introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.contact.update({
      where: { id: contactId },
      data: { isBlacklisted: blacklisted },
    });
    await prisma.auditLog.create({
      data: {
        action: blacklisted ? "opt-out" : "opt-in",
        entity: "contact",
        entityId: contactId,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { phone: target.phone, manual: true },
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/contacts");
    revalidatePath("/contacts/blacklist");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "toggleBlacklistAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

// ---------- LIST BLACKLISTED ----------
export async function listBlacklistedAction() {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const rows = await prisma.contact.findMany({
    where: { organizationId: g.ctx.organizationId, isBlacklisted: true, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return { success: true as const, data: rows };
}

// ---------- HISTORY (last 10 SMS for a contact) ----------
export async function getContactHistoryAction(contactId: string, limit = 10) {
  const g = await requirePermission("contacts:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };
  try {
    const target = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { organizationId: true, phone: true },
    });
    if (!target) return { success: false as const, data: [], error: "Contact introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    const messages = await prisma.smsMessage.findMany({
      where: {
        organizationId: g.ctx.organizationId,
        OR: [
          { contactId: contactId },
          { destinationAddr: target.phone },
          { sourceAddr: target.phone },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
      select: {
        id: true, direction: true, sourceAddr: true, destinationAddr: true,
        content: true, status: true, dlrStatus: true, segments: true,
        sentAt: true, deliveredAt: true, createdAt: true,
      },
    });
    return { success: true as const, data: messages };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "getContactHistoryAction failed");
    return { success: false as const, data: [], error: "Erreur." };
  }
}

// ---------- DELETE (soft) ----------
export async function deleteContactAction(contactId: string) {
  const g = await requirePermission("contacts:delete");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const target = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { organizationId: true },
    });
    if (!target) return { success: false as const, error: "Contact introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.contact.update({ where: { id: contactId }, data: { deletedAt: new Date() } });

    await prisma.auditLog.create({
      data: {
        action: "delete",
        entity: "contact",
        entityId: contactId,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/contacts");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "deleteContactAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

// ---------- IMPORT (bulk) ----------
export async function importContactsAction(
  rows: Array<{ phone: string; firstName?: string; lastName?: string; tags?: string[] }>
): Promise<{ created: number; duplicates: number; errors: number; error?: string }> {
  const g = await requirePermission("contacts:create");
  if (!g.ok) return { created: 0, duplicates: 0, errors: 0, error: g.error };

  let created = 0;
  let duplicates = 0;
  let errors = 0;

  // Dedupe within the input by phone
  const byPhone = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    try {
      const phone = normalizePhone(r.phone);
      if (!/^\+[1-9]\d{6,14}$/.test(phone)) { errors++; continue; }
      if (!byPhone.has(phone)) byPhone.set(phone, { ...r, phone });
      else duplicates++;
    } catch { errors++; }
  }

  const phones = Array.from(byPhone.keys());
  if (phones.length === 0) {
    revalidatePath("/contacts");
    return { created, duplicates, errors };
  }

  // Find existing rows in one query (skipDuplicates can't tell us which were dups)
  const existing = await prisma.contact.findMany({
    where: { organizationId: g.ctx.organizationId, phone: { in: phones }, deletedAt: null },
    select: { phone: true },
  });
  const existingSet = new Set(existing.map((e) => e.phone));

  const toCreate = phones
    .filter((p) => !existingSet.has(p))
    .map((p) => {
      const r = byPhone.get(p)!;
      return {
        phone: p,
        firstName: r.firstName || null,
        lastName: r.lastName || null,
        country: detectCountry(p),
        tags: r.tags ?? [],
        organizationId: g.ctx.organizationId,
      };
    });

  duplicates += existingSet.size;

  if (toCreate.length > 0) {
    const result = await prisma.contact.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    created = result.count;
  }

  await prisma.auditLog.create({
    data: {
      action: "import",
      entity: "contact",
      userId: g.ctx.userId,
      userEmail: g.ctx.email,
      details: { created, duplicates, errors },
      organizationId: g.ctx.organizationId,
    },
  });

  logger.info({ created, duplicates, errors }, "Contacts imported");
  revalidatePath("/contacts");
  return { created, duplicates, errors };
}
