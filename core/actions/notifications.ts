"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { orgGuard } from "@/core/lib/auth/org-guard";

export async function listNotificationsAction(opts?: { unreadOnly?: boolean; limit?: number }) {
  const g = await orgGuard();
  if (!g.ok) return { ok: false as const, data: [], unread: 0, error: g.error };

  const where: Record<string, unknown> = { userId: g.ctx.userId };
  if (opts?.unreadOnly) where.isRead = false;

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.limit ?? 50, 200),
    }),
    prisma.notification.count({ where: { userId: g.ctx.userId, isRead: false } }),
  ]);
  return { ok: true as const, data: rows, unread };
}

export async function markNotificationReadAction(id: string) {
  const g = await orgGuard();
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    await prisma.notification.updateMany({
      where: { id, userId: g.ctx.userId },
      data: { isRead: true, readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { ok: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "markNotificationReadAction failed");
    return { ok: false as const, error: "Erreur." };
  }
}

export async function markAllNotificationsReadAction() {
  const g = await orgGuard();
  if (!g.ok) return { ok: false as const, count: 0, error: g.error };
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: g.ctx.userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { ok: true as const, count: result.count };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "markAllNotificationsReadAction failed");
    return { ok: false as const, count: 0, error: "Erreur." };
  }
}

export async function getUnreadCountAction(): Promise<number> {
  const g = await orgGuard();
  if (!g.ok) return 0;
  return prisma.notification.count({ where: { userId: g.ctx.userId, isRead: false } });
}
