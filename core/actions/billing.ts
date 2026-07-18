"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { assertSameOrg } from "@/core/lib/auth/org-guard";
import type { TransactionType } from "@/app/generated/prisma/client";

async function ensureBalance(organizationId: string) {
  const existing = await prisma.creditBalance.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return prisma.creditBalance.create({
    data: { organizationId, balance: 0 },
  });
}

export async function getBillingOverviewAction() {
  const g = await requirePermission("billing:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const balance = await ensureBalance(g.ctx.organizationId);
  const since = new Date(Date.now() - 90 * 86_400_000);

  const txAgg = await prisma.creditTransaction.groupBy({
    by: ["type"],
    where: { balanceId: balance.id, createdAt: { gte: since } },
    _sum: { amount: true },
  });
  const sum = (t: TransactionType) =>
    Number(txAgg.find((r) => r.type === t)?._sum.amount ?? 0);

  // Per-day consumption (DEBIT)
  const debits = await prisma.creditTransaction.findMany({
    where: { balanceId: balance.id, type: "DEBIT", createdAt: { gte: since } },
    select: { amount: true, createdAt: true },
  });
  const daily: Record<string, number> = {};
  for (let t = since.getTime(); t <= Date.now(); t += 86_400_000) {
    daily[new Date(t).toISOString().slice(0, 10)] = 0;
  }
  for (const d of debits) {
    const k = d.createdAt.toISOString().slice(0, 10);
    if (daily[k] !== undefined) daily[k] += Number(d.amount);
  }

  const balanceNum = Number(balance.balance);
  const thresholdNum = Number(balance.alertThreshold ?? 0);
  const alert = thresholdNum > 0 && balanceNum < thresholdNum;

  return {
    ok: true as const,
    data: {
      balance: balanceNum,
      alertThreshold: thresholdNum,
      alert,
      last90d: {
        credit: sum("CREDIT"),
        debit: sum("DEBIT"),
        refund: sum("REFUND"),
        adjustment: sum("ADJUSTMENT"),
      },
      daily: Object.entries(daily).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 })),
    },
  };
}

export async function listTransactionsAction(params: { cursor?: string | null; limit?: number } = {}) {
  const g = await requirePermission("billing:view");
  if (!g.ok) return { ok: false as const, data: [], error: g.error };

  const balance = await ensureBalance(g.ctx.organizationId);
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const rows = await prisma.creditTransaction.findMany({
    where: { balanceId: balance.id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
  });
  let nextCursor: string | null = null;
  if (rows.length > limit) { nextCursor = rows.pop()!.id; }

  return { ok: true as const, data: rows, nextCursor };
}

async function applyTransaction(
  organizationId: string,
  delta: number,
  type: TransactionType,
  description: string | null,
  reference: string | null,
  actor: { userId: string; email: string }
) {
  return prisma.$transaction(async (tx) => {
    const balance = await tx.creditBalance.findUnique({ where: { organizationId } });
    if (!balance) throw new Error("CreditBalance missing");
    const newBalance = Number(balance.balance) + delta;
    if (newBalance < 0) throw new Error("Solde insuffisant");

    const updated = await tx.creditBalance.update({
      where: { organizationId },
      data: { balance: newBalance },
    });
    const txRow = await tx.creditTransaction.create({
      data: {
        type,
        amount: delta,
        balanceAfter: newBalance,
        description: description ?? null,
        reference: reference ?? null,
        balanceId: balance.id,
      },
    });
    await tx.auditLog.create({
      data: {
        action: type.toLowerCase(),
        entity: "credit",
        entityId: txRow.id,
        userId: actor.userId,
        userEmail: actor.email,
        details: { amount: delta, balanceAfter: newBalance },
        organizationId,
      },
    });

    // Threshold alert -> Notification (only when crossing downward)
    const threshold = Number(updated.alertThreshold ?? 0);
    if (threshold > 0 && newBalance < threshold && Number(balance.balance) >= threshold) {
      const users = await tx.user.findMany({
        where: { organizationId, deletedAt: null, role: { in: ["SUPER_ADMIN", "ADMIN"] } },
        select: { id: true },
      });
      for (const u of users) {
        await tx.notification.create({
          data: {
            type: "CREDITS_LOW",
            title: "Solde de cr\u00e9dits faible",
            message: `Le solde (${newBalance} DJF) est pass\u00e9 sous le seuil d'alerte (${threshold} DJF).`,
            data: { balance: newBalance, threshold } as never,
            userId: u.id,
          },
        });
      }
    }
    return { balance: newBalance, transaction: txRow };
  });
}

export async function creditAccountAction(input: {
  amount: number;
  description?: string;
  reference?: string;
}) {
  const g = await requirePermission("billing:update");
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false as const, error: "Montant invalide." };
  }
  try {
    await ensureBalance(g.ctx.organizationId);
    const result = await applyTransaction(
      g.ctx.organizationId, input.amount, "CREDIT",
      input.description ?? "Rechargement manuel",
      input.reference ?? null,
      { userId: g.ctx.userId, email: g.ctx.email }
    );
    revalidatePath("/billing");
    return { ok: true as const, balance: result.balance };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "creditAccountAction failed");
    return { ok: false as const, error: (err as Error).message };
  }
}

export async function debitAccountAction(input: {
  amount: number;
  description?: string;
  reference?: string;
}) {
  const g = await requirePermission("billing:update");
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false as const, error: "Montant invalide." };
  }
  try {
    await ensureBalance(g.ctx.organizationId);
    const result = await applyTransaction(
      g.ctx.organizationId, -input.amount, "DEBIT",
      input.description ?? null,
      input.reference ?? null,
      { userId: g.ctx.userId, email: g.ctx.email }
    );
    revalidatePath("/billing");
    return { ok: true as const, balance: result.balance };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "debitAccountAction failed");
    return { ok: false as const, error: (err as Error).message };
  }
}

export async function setAlertThresholdAction(threshold: number) {
  const g = await requirePermission("billing:update");
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!Number.isFinite(threshold) || threshold < 0) {
    return { ok: false as const, error: "Seuil invalide." };
  }
  await ensureBalance(g.ctx.organizationId);
  await prisma.creditBalance.update({
    where: { organizationId: g.ctx.organizationId },
    data: { alertThreshold: threshold },
  });
  revalidatePath("/billing");
  return { ok: true as const };
}

export async function consumptionBreakdownAction(opts?: { days?: number }) {
  const g = await requirePermission("billing:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  const since = new Date(Date.now() - (opts?.days ?? 30) * 86_400_000);

  // By campaign
  const byCampaign = await prisma.smsMessage.groupBy({
    by: ["campaignId"],
    where: {
      organizationId: g.ctx.organizationId,
      direction: "OUTBOUND",
      campaignId: { not: null },
      createdAt: { gte: since },
    },
    _count: { _all: true },
    _sum: { cost: true },
  });
  const campaignIds = byCampaign.map((b) => b.campaignId).filter((id): id is string => !!id);
  const campaigns = campaignIds.length
    ? await prisma.campaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, name: true },
      })
    : [];
  const campaignsBreakdown = byCampaign.map((b) => ({
    label: campaigns.find((c) => c.id === b.campaignId)?.name ?? "—",
    messages: b._count._all,
    cost: Number(b._sum.cost ?? 0),
  }));

  // By provider
  const byProvider = await prisma.smsMessage.groupBy({
    by: ["providerId"],
    where: {
      organizationId: g.ctx.organizationId,
      direction: "OUTBOUND",
      providerId: { not: null },
      createdAt: { gte: since },
    },
    _count: { _all: true },
    _sum: { cost: true },
  });
  const providerIds = byProvider.map((b) => b.providerId).filter((id): id is string => !!id);
  const providers = providerIds.length
    ? await prisma.smsProvider.findMany({
        where: { id: { in: providerIds } },
        select: { id: true, name: true },
      })
    : [];
  const connectorsBreakdown = byProvider.map((b) => ({
    label: providers.find((c) => c.id === b.providerId)?.name ?? "—",
    messages: b._count._all,
    cost: Number(b._sum.cost ?? 0),
  }));

  return {
    ok: true as const,
    data: { campaigns: campaignsBreakdown, connectors: connectorsBreakdown },
  };
}

export async function generateMonthlyInvoiceAction(year: number, month: number) {
  const g = await requirePermission("billing:view");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const balance = await ensureBalance(g.ctx.organizationId);

    const debits = await prisma.creditTransaction.findMany({
      where: { balanceId: balance.id, type: "DEBIT", createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "asc" },
    });
    const total = debits.reduce((sum, d) => sum + Number(d.amount), 0);
    const org = await prisma.organization.findUnique({
      where: { id: g.ctx.organizationId },
      select: { name: true, slug: true },
    });

    const { jsPDF } = await import("jspdf");
    const autoTableMod = await import("jspdf-autotable");
    const autoTable = (autoTableMod as unknown as { default?: typeof autoTableMod }).default ?? autoTableMod;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("SMS Gateway Pro \u2014 Facture", 14, 18);
    doc.setFontSize(10);
    doc.text(`Organisation : ${org?.name ?? ""}`, 14, 28);
    doc.text(`P\u00e9riode : ${String(month).padStart(2, "0")}/${year}`, 14, 34);
    doc.text(`G\u00e9n\u00e9r\u00e9 le : ${new Date().toLocaleString("fr-FR")}`, 14, 40);

    (autoTable as unknown as (doc: unknown, opts: unknown) => void)(doc, {
      startY: 50,
      head: [["Date", "Description", "R\u00e9f\u00e9rence", "Montant"]],
      body: debits.map((d) => [
        d.createdAt.toLocaleDateString("fr-FR"),
        d.description ?? "\u2014",
        d.reference ?? "\u2014",
        Math.abs(Number(d.amount)).toFixed(2) + " DJF",
      ]),
      foot: [["", "", "Total", Math.abs(total).toFixed(2) + " DJF"]],
      styles: { fontSize: 9 },
    });

    const base64 = doc.output("datauristring").split(",")[1] ?? "";
    const filename = `facture-${org?.slug ?? "org"}-${year}-${String(month).padStart(2, "0")}.pdf`;
    return { ok: true as const, base64, filename, total: Math.abs(total), count: debits.length };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "generateMonthlyInvoiceAction failed");
    return { ok: false as const, error: "Impossible de g\u00e9n\u00e9rer la facture." };
  }
}
