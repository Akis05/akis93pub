"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";

export interface WebhookFormInput {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  isActive?: boolean;
}

const ALLOWED_EVENTS = [
  "sms.queued", "sms.sent", "sms.delivered", "sms.failed",
  "campaign.started", "campaign.completed",
  "contact.opt_out",
] as const;

export async function listWebhooksAction() {
  const g = await requirePermission("webhooks:view");
  if (!g.ok) return { ok: false as const, data: [], error: g.error };

  const rows = await prisma.webhook.findMany({
    where: { organizationId: g.ctx.organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { deliveries: true } } },
  });
  return {
    ok: true as const,
    data: rows.map((w) => ({
      id: w.id, name: w.name, url: w.url, events: w.events,
      isActive: w.isActive, failureCount: w.failureCount,
      lastTriggeredAt: w.lastTriggeredAt, lastSuccessAt: w.lastSuccessAt,
      lastFailureAt: w.lastFailureAt, deliveryCount: w._count.deliveries,
      createdAt: w.createdAt,
    })),
  };
}

export async function createWebhookAction(input: WebhookFormInput) {
  const g = await requirePermission("webhooks:create");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    if (!input.name?.trim()) return { ok: false as const, error: "Le nom est requis." };
    if (!input.url?.startsWith("https://") && !input.url?.startsWith("http://")) {
      return { ok: false as const, error: "URL invalide." };
    }
    const invalid = input.events.filter((e) => !(ALLOWED_EVENTS as readonly string[]).includes(e));
    if (invalid.length > 0) return { ok: false as const, error: `\u00c9v\u00e9nements inconnus : ${invalid.join(", ")}` };

    const secret = input.secret || crypto.randomBytes(24).toString("hex");
    const webhook = await prisma.webhook.create({
      data: {
        name: input.name.trim(),
        url: input.url,
        secret,
        events: input.events,
        isActive: input.isActive ?? true,
        organizationId: g.ctx.organizationId,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "create", entity: "webhook", entityId: webhook.id,
        userId: g.ctx.userId, userEmail: g.ctx.email,
        details: { name: input.name, url: input.url, events: input.events },
        organizationId: g.ctx.organizationId,
      },
    });
    revalidatePath("/webhooks");
    return { ok: true as const, data: webhook };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "createWebhookAction failed");
    return { ok: false as const, error: "Erreur lors de la cr\u00e9ation." };
  }
}

export async function updateWebhookAction(id: string, input: Partial<WebhookFormInput>) {
  const g = await requirePermission("webhooks:update");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    const target = await prisma.webhook.findUnique({ where: { id }, select: { organizationId: true } });
    if (!target) return { ok: false as const, error: "Webhook introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    const updated = await prisma.webhook.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        url: input.url,
        secret: input.secret,
        events: input.events,
        isActive: input.isActive,
      },
    });
    revalidatePath("/webhooks");
    return { ok: true as const, data: updated };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "updateWebhookAction failed");
    return { ok: false as const, error: "Erreur." };
  }
}

export async function deleteWebhookAction(id: string) {
  const g = await requirePermission("webhooks:delete");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    const target = await prisma.webhook.findUnique({ where: { id }, select: { organizationId: true } });
    if (!target) return { ok: false as const, error: "Webhook introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.webhook.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/webhooks");
    return { ok: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "deleteWebhookAction failed");
    return { ok: false as const, error: "Erreur." };
  }
}

export async function signTestPayloadAction(id: string) {
  const g = await requirePermission("webhooks:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    const webhook = await prisma.webhook.findFirst({
      where: { id, organizationId: g.ctx.organizationId },
    });
    if (!webhook) return { ok: false as const, error: "Webhook introuvable." };

    const { testWebhookDeliveryViaBridge } = await import("@/core/lib/bridge-client");
    const payload = {
      event: "test",
      timestamp: new Date().toISOString(),
      data: { hello: "world" },
    };
    await testWebhookDeliveryViaBridge({
      webhookId: webhook.id, url: webhook.url,
      event: "test", payload,
    });
    return { ok: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "signTestPayloadAction failed");
    return { ok: false as const, error: "Erreur." };
  }
}

export async function listWebhookDeliveriesAction(webhookId: string, limit = 50) {
  const g = await requirePermission("webhooks:view");
  if (!g.ok) return { ok: false as const, data: [], error: g.error };
  const target = await prisma.webhook.findUnique({ where: { id: webhookId }, select: { organizationId: true } });
  if (!target) return { ok: false as const, data: [], error: "Webhook introuvable." };
  assertSameOrg(g.ctx, target.organizationId);

  const rows = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
  return { ok: true as const, data: rows };
}
