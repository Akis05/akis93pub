"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";
import { resolveGroupContactsAction } from "@/core/actions/groups";
import {
  launchCampaignViaBridge,
  cancelCampaignJobsViaBridge,
  sendSmsViaBridge,
  type BridgeCampaignChunk,
} from "@/core/lib/bridge-client";
import type { CampaignStatus } from "@/app/generated/prisma/client";

export interface CampaignFormInput {
  name: string;
  description?: string;
  senderId?: string | null;
  templateId?: string | null;
  message?: string | null;
  scheduledAt?: string | null;
  groupIds?: string[];
}

const CHUNK_SIZE = 1000;

export async function listCampaignsAction(opts?: { status?: CampaignStatus | "ALL" }) {
  const g = await requirePermission("campaigns:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const where: Record<string, unknown> = { organizationId: g.ctx.organizationId, deletedAt: null };
  if (opts?.status && opts.status !== "ALL") where.status = opts.status;

  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      groups: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
      senderIdRef: { select: { id: true, name: true } },
    },
    take: 200,
  });
  return { success: true as const, data: campaigns };
}

export async function getCampaignAction(id: string) {
  const g = await requirePermission("campaigns:view");
  if (!g.ok) return { success: false as const, error: g.error };
  const c = await prisma.campaign.findFirst({
    where: { id, organizationId: g.ctx.organizationId },
    include: {
      groups: true,
      template: true,
      senderIdRef: true,
    },
  });
  if (!c) return { success: false as const, error: "Campagne introuvable." };
  return { success: true as const, data: c };
}

async function computeAudience(organizationId: string, groupIds: string[]): Promise<string[]> {
  if (groupIds.length === 0) return [];
  const contactIdSet = new Set<string>();
  for (const gid of groupIds) {
    const r = await resolveGroupContactsAction(gid);
    if (r.ok) r.ids.forEach((id) => contactIdSet.add(id));
  }
  if (contactIdSet.size === 0) return [];
  // Filter out blacklisted / deleted in a single query
  const valid = await prisma.contact.findMany({
    where: {
      id: { in: Array.from(contactIdSet) },
      organizationId,
      deletedAt: null,
      isBlacklisted: false,
    },
    select: { id: true },
  });
  return valid.map((c) => c.id);
}

export async function createCampaignAction(input: CampaignFormInput) {
  const g = await requirePermission("campaigns:create");
  if (!g.ok) return { success: false as const, error: g.error };

  try {
    if (!input.name?.trim()) return { success: false as const, error: "Le nom est requis." };
    if (!input.message && !input.templateId) {
      return { success: false as const, error: "Message ou template requis." };
    }

    const audience = await computeAudience(g.ctx.organizationId, input.groupIds ?? []);
    const status: CampaignStatus = input.scheduledAt ? "SCHEDULED" : "DRAFT";

    const campaign = await prisma.campaign.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        senderId: input.senderId || null,
        templateId: input.templateId || null,
        message: input.message || null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status,
        totalRecipients: audience.length,
        organizationId: g.ctx.organizationId,
        groups: input.groupIds && input.groupIds.length > 0
          ? { connect: input.groupIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "create",
        entity: "campaign",
        entityId: campaign.id,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { audience: audience.length },
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/campaigns");
    return { success: true as const, data: campaign };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to create campaign");
    return { success: false as const, error: "Erreur lors de la cr\u00e9ation." };
  }
}

export async function launchCampaignAction(id: string) {
  const g = await requirePermission("campaigns:update");
  if (!g.ok) return { success: false as const, error: g.error };

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId: g.ctx.organizationId },
      include: { groups: { select: { id: true } }, senderIdRef: true, template: true },
    });
    if (!campaign) return { success: false as const, error: "Campagne introuvable." };
    assertSameOrg(g.ctx, campaign.organizationId);

    if (campaign.status === "RUNNING") return { success: false as const, error: "Campagne d\u00e9j\u00e0 en cours." };
    if (campaign.status === "COMPLETED") return { success: false as const, error: "Campagne d\u00e9j\u00e0 termin\u00e9e." };
    if (campaign.status === "CANCELLED") return { success: false as const, error: "Campagne annul\u00e9e." };

    const message = campaign.message ?? campaign.template?.content;
    if (!message) return { success: false as const, error: "Aucun contenu \u00e0 envoyer." };

    const audience = await computeAudience(
      g.ctx.organizationId,
      campaign.groups.map((gp) => gp.id)
    );
    if (audience.length === 0) {
      return { success: false as const, error: "Audience vide (aucun contact \u00e9ligible)." };
    }

    // Refresh total recipients in case of audience changes since creation
    await prisma.campaign.update({
      where: { id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        totalRecipients: audience.length,
        sentCount: 0,
        deliveredCount: 0,
        failedCount: 0,
      },
    });

    // Resolve phones in bulk
    const contacts = await prisma.contact.findMany({
      where: { id: { in: audience } },
      select: { id: true, phone: true },
    });

    // Find the source addr (sender id name)
    const sourceAddr = campaign.senderIdRef?.name ?? process.env.SMPP_SOURCE_ADDR ?? "GATEWAY";

    // The SMPP connection is driven exclusively by the .env config, so there
    // is no per-org connector to select. The bridge's worker binds the env
    // session (see smpp-bridge/).

    // Chunk and enqueue via the SMPP Bridge.
    const chunks: BridgeCampaignChunk[] = [];
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      const slice = contacts.slice(i, i + CHUNK_SIZE);
      chunks.push({
        campaignId: id,
        organizationId: g.ctx.organizationId,
        message,
        sourceAddr,
        connectorId: null,
        recipients: slice.map((c) => ({ contactId: c.id, phone: c.phone })),
      });
    }

    let enqueuedChunks = 0;
    try {
      const result = await launchCampaignViaBridge(chunks);
      enqueuedChunks = result.enqueuedChunks;
    } catch (err) {
      logger.error({ err: (err as Error).message, campaignId: id }, "Failed to launch campaign via bridge");
    }

    if (enqueuedChunks === 0) {
      // Nothing made it to the queue: revert to DRAFT so the user can retry.
      await prisma.campaign.update({
        where: { id },
        data: { status: "DRAFT", startedAt: null },
      });
      return { success: false as const, error: "\u00c9chec de la mise en file des messages. R\u00e9essayez." };
    }

    await prisma.auditLog.create({
      data: {
        action: "launch",
        entity: "campaign",
        entityId: id,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { audience: audience.length, chunks: Math.ceil(audience.length / CHUNK_SIZE) },
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/campaigns");
    return { success: true as const, audience: audience.length };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to launch campaign");
    return { success: false as const, error: "Erreur lors du lancement." };
  }
}

export async function pauseCampaignAction(id: string) {
  const g = await requirePermission("campaigns:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    await prisma.campaign.update({
      where: { id }, data: { status: "PAUSED", pausedAt: new Date() },
    });
    revalidatePath("/campaigns");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "pauseCampaignAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function resumeCampaignAction(id: string) {
  const g = await requirePermission("campaigns:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    await prisma.campaign.update({
      where: { id }, data: { status: "RUNNING" },
    });
    revalidatePath("/campaigns");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "resumeCampaignAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function cancelCampaignAction(id: string) {
  const g = await requirePermission("campaigns:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    await prisma.campaign.update({
      where: { id }, data: { status: "CANCELLED" },
    });
    // Best-effort: remove pending chunks from the bridge's BullMQ queue
    try {
      await cancelCampaignJobsViaBridge(id);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Campaign chunk removal (via bridge) failed");
    }
    revalidatePath("/campaigns");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "cancelCampaignAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function duplicateCampaignAction(id: string) {
  const g = await requirePermission("campaigns:create");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const src = await prisma.campaign.findFirst({
      where: { id, organizationId: g.ctx.organizationId },
      include: { groups: { select: { id: true } } },
    });
    if (!src) return { success: false as const, error: "Campagne introuvable." };

    const copy = await prisma.campaign.create({
      data: {
        name: `${src.name} (copie)`,
        description: src.description,
        message: src.message,
        templateId: src.templateId,
        senderId: src.senderId,
        status: "DRAFT",
        organizationId: g.ctx.organizationId,
        groups: { connect: src.groups.map((gp) => ({ id: gp.id })) },
      },
    });
    revalidatePath("/campaigns");
    return { success: true as const, data: copy };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "duplicateCampaignAction failed");
    return { success: false as const, error: "Erreur." };
  }
}

export async function getCampaignMessagesAction(id: string, limit = 100) {
  const g = await requirePermission("campaigns:view");
  if (!g.ok) return { success: false as const, data: [], error: g.error };

  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId: g.ctx.organizationId },
    select: { id: true },
  });
  if (!campaign) return { success: false as const, data: [], error: "Campagne introuvable." };

  const messages = await prisma.smsMessage.findMany({
    where: { campaignId: id, organizationId: g.ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: {
      id: true, destinationAddr: true, sourceAddr: true, content: true,
      status: true, dlrStatus: true, dlrErrorCode: true,
      sentAt: true, deliveredAt: true, createdAt: true,
    },
  });
  return { success: true as const, data: messages };
}

/** Re-enqueues every FAILED message tied to a campaign (individual send retries). */
export async function resendCampaignFailedAction(id: string) {
  const g = await requirePermission("campaigns:update");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId: g.ctx.organizationId },
      select: { id: true, status: true, organizationId: true },
    });
    if (!campaign) return { success: false as const, error: "Campagne introuvable." };
    assertSameOrg(g.ctx, campaign.organizationId);

    const failed = await prisma.smsMessage.findMany({
      where: { campaignId: id, organizationId: g.ctx.organizationId, status: "FAILED" },
      select: { id: true, destinationAddr: true, content: true, sourceAddr: true },
    });
    if (failed.length === 0) {
      return { success: false as const, error: "Aucun message en échec à réenvoyer." };
    }

    let resent = 0;
    for (const m of failed) {
      try {
        await prisma.smsMessage.update({
          where: { id: m.id },
          data: { status: "QUEUED", dlrStatus: null, dlrErrorCode: null, dlrReceivedAt: null },
        });
        await sendSmsViaBridge({
          to: m.destinationAddr,
          text: m.content,
          from: m.sourceAddr,
          requestDeliveryReceipt: true,
          externalId: m.id,
          organizationId: g.ctx.organizationId,
        });
        resent++;
      } catch (err) {
        logger.warn({ err: (err as Error).message, messageId: m.id }, "resendCampaignFailedAction: single resend failed");
      }
    }

    if (resent > 0) {
      await prisma.campaign.update({
        where: { id },
        data: {
          failedCount: { decrement: resent },
          sentCount: { increment: resent },
          ...(campaign.status === "COMPLETED" ? { status: "RUNNING", completedAt: null } : {}),
        },
      });
      await prisma.auditLog.create({
        data: {
          action: "resend", entity: "campaign", entityId: id,
          userId: g.ctx.userId, userEmail: g.ctx.email,
          details: { resent, attempted: failed.length },
          organizationId: g.ctx.organizationId,
        },
      });
    }

    revalidatePath("/campaigns");
    return { success: true as const, resent, attempted: failed.length };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "resendCampaignFailedAction failed");
    return { success: false as const, error: "Erreur lors du réenvoi." };
  }
}

/** Legacy alias kept for backwards compatibility */
export async function updateCampaignStatusAction(id: string, status: CampaignStatus) {
  switch (status) {
    case "RUNNING": return launchCampaignAction(id);
    case "PAUSED": return pauseCampaignAction(id);
    case "CANCELLED": return cancelCampaignAction(id);
    default: {
      const g = await requirePermission("campaigns:update");
      if (!g.ok) return { success: false as const, error: g.error };
      await prisma.campaign.update({ where: { id }, data: { status } });
      revalidatePath("/campaigns");
      return { success: true as const };
    }
  }
}

export async function deleteCampaignAction(id: string) {
  const g = await requirePermission("campaigns:delete");
  if (!g.ok) return { success: false as const, error: g.error };
  try {
    await prisma.campaign.update({
      where: { id }, data: { deletedAt: new Date() },
    });
    revalidatePath("/campaigns");
    return { success: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "deleteCampaignAction failed");
    return { success: false as const, error: "Erreur." };
  }
}
