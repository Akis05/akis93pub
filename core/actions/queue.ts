"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import {
  getQueueStatsFromBridge,
  pauseQueueViaBridge,
  resumeQueueViaBridge,
  purgeQueueViaBridge,
  retryQueueJobViaBridge,
  sendSmsViaBridge,
} from "@/core/lib/bridge-client";
import type { MessageStatus } from "@/app/generated/prisma/client";

const QUEUE_STATUSES: MessageStatus[] = ["PENDING", "QUEUED", "SENDING"];

export async function listQueueAction(opts?: { status?: MessageStatus | "ALL" }) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { success: false, data: [], stats: null, connectors: [], bullmq: null, error: g.error };
  const organizationId = g.ctx.organizationId;

  const statusFilter: MessageStatus[] = (() => {
    if (!opts?.status || opts.status === "ALL") return QUEUE_STATUSES;
    return [opts.status];
  })();

  const messages = await prisma.smsMessage.findMany({
    where: { organizationId, status: { in: statusFilter } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const grouped = await prisma.smsMessage.groupBy({
    by: ["status"],
    where: { organizationId, status: { in: QUEUE_STATUSES } },
    _count: { _all: true },
  });
  const stats = {
    pending: grouped.find((g) => g.status === "PENDING")?._count._all ?? 0,
    queued: grouped.find((g) => g.status === "QUEUED")?._count._all ?? 0,
    sending: grouped.find((g) => g.status === "SENDING")?._count._all ?? 0,
  };

  // Bridge queue counts (best-effort, bridge may be unreachable in dev)
  let bullmq: Record<string, number> | null = null;
  try {
    const stats = await getQueueStatsFromBridge();
    bullmq = stats.sms;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Bridge getQueueStats failed");
  }

  return { success: true, data: messages, stats, connectors: [], bullmq };
}

/**
 * List messages currently held in the SMSC store-and-forward buffer:
 * submitted to the SMSC (status SENT) but without a final DLR yet. This is
 * the case e.g. when the destination handset is unreachable and the SMSC
 * retains the message until delivery or expiry of its validity period.
 */
export async function listSmscStoreAction(opts?: { search?: string }) {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { success: false, data: [], stats: null, connectors: [], error: g.error };
  const organizationId = g.ctx.organizationId;

  const search = opts?.search?.trim();
  const where: NonNullable<Parameters<typeof prisma.smsMessage.findMany>[0]>["where"] = {
    organizationId,
    status: "SENT",
    AND: [
      { OR: [{ dlrStatus: null }, { dlrStatus: "ACCEPTD" }] },
      ...(search
        ? [
            {
              OR: [
                { destinationAddr: { contains: search } },
                { sourceAddr: { contains: search } },
                { providerMessageId: { contains: search } },
              ],
            },
          ]
        : []),
    ],
  };

  const messages = await prisma.smsMessage.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: 500,
  });

  const total = await prisma.smsMessage.count({
    where: {
      organizationId,
      status: "SENT",
      OR: [{ dlrStatus: null }, { dlrStatus: "ACCEPTD" }],
    },
  });
  const accepted = await prisma.smsMessage.count({
    where: { organizationId, status: "SENT", dlrStatus: "ACCEPTD" },
  });
  const stats = { total, awaiting: total - accepted, accepted };

  return { success: true, data: messages, stats, connectors: [] };
}

export async function pauseQueueAction() {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { success: false, error: g.error };
  try { await pauseQueueViaBridge(); } catch (err) {
    logger.warn({ err: (err as Error).message }, "Bridge queue pause failed");
  }
  const result = await prisma.smsMessage.updateMany({
    where: { organizationId: g.ctx.organizationId, status: "QUEUED" },
    data: { status: "PENDING" },
  });
  revalidatePath("/sms/queue");
  return { success: true, count: result.count };
}

export async function resumeQueueAction() {
  const g = await requirePermission("sms:view");
  if (!g.ok) return { success: false, error: g.error };
  try { await resumeQueueViaBridge(); } catch (err) {
    logger.warn({ err: (err as Error).message }, "Bridge queue resume failed");
  }
  const result = await prisma.smsMessage.updateMany({
    where: { organizationId: g.ctx.organizationId, status: "PENDING" },
    data: { status: "QUEUED" },
  });
  revalidatePath("/sms/queue");
  return { success: true, count: result.count };
}

export async function retryMessageAction(messageId: string) {
  const g = await requirePermission("sms:send");
  if (!g.ok) return { success: false, error: g.error };
  try {
    const msg = await prisma.smsMessage.findFirst({
      where: { id: messageId, organizationId: g.ctx.organizationId },
    });
    if (!msg) return { success: false, error: "Message introuvable." };

    await prisma.smsMessage.update({
      where: { id: messageId },
      data: { status: "QUEUED", dlrStatus: null, dlrErrorCode: null },
    });

    await sendSmsViaBridge({
      to: msg.destinationAddr.startsWith("+") ? msg.destinationAddr : `+${msg.destinationAddr}`,
      text: msg.content,
      from: msg.sourceAddr,
      requestDeliveryReceipt: true,
      externalId: msg.id,
      organizationId: g.ctx.organizationId,
    });

    revalidatePath("/sms/queue");
    return { success: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to retry message");
    return { success: false, error: "Erreur." };
  }
}

export async function retryQueueJobAction(jobId: string) {
  const g = await requirePermission("sms:send");
  if (!g.ok) return { success: false, error: g.error };
  try {
    await retryQueueJobViaBridge(jobId);
    revalidatePath("/sms/queue");
    return { success: true };
  } catch (err) {
    logger.error({ err: (err as Error).message, jobId }, "Failed to retry queue job");
    return { success: false, error: "Erreur." };
  }
}

export async function purgeQueueAction() {
  const g = await requirePermission("sms:send");
  if (!g.ok) return { success: false, error: g.error };
  try {
    try {
      await purgeQueueViaBridge();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Bridge queue purge failed");
    }
    const result = await prisma.smsMessage.updateMany({
      where: { organizationId: g.ctx.organizationId, status: { in: ["PENDING", "QUEUED"] } },
      data: { status: "CANCELLED" },
    });
    revalidatePath("/sms/queue");
    return { success: true, count: result.count };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Failed to purge queue");
    return { success: false, error: "Erreur." };
  }
}
