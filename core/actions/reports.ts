"use server";

import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  scheduleReportViaBridge,
  listScheduledReportsFromBridge,
  cancelScheduledReportViaBridge,
} from "@/core/lib/bridge-client";
import type { ReportFilters } from "@/core/features/reports/types";

export interface ScheduleReportInput {
  name: string;
  filters: ReportFilters;
  /** Cron expression, e.g. '0 8 * * 1' for every Monday 08:00 */
  cron: string;
  /** Email recipients */
  recipients: string[];
}

function resolveRange(f: ReportFilters): { from: Date; to: Date } {
  const now = new Date();
  const to = f.to ? new Date(f.to) : now;
  if (f.period === "custom" && f.from) return { from: new Date(f.from), to };
  const days = { today: 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[f.period] ?? 7;
  return { from: new Date(now.getTime() - days * 86_400_000), to };
}

function baseWhere(orgId: string, from: Date, to: Date): Prisma.SmsMessageWhereInput {
  return {
    organizationId: orgId,
    direction: "OUTBOUND",
    createdAt: { gte: from, lte: to },
  };
}

function countryFromDest(bare: string): string {
  if (bare.startsWith("253")) return "DJ";
  if (bare.startsWith("33")) return "FR";
  if (bare.startsWith("251")) return "ET";
  if (bare.startsWith("254")) return "KE";
  if (bare.startsWith("44")) return "GB";
  if (bare.startsWith("971")) return "AE";
  if (bare.startsWith("966")) return "SA";
  if (bare.startsWith("1")) return "US";
  return "OTHER";
}

export async function getReportAction(filters: ReportFilters) {
  const g = await requirePermission("reports:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const { from, to } = resolveRange(filters);
  const where = baseWhere(g.ctx.organizationId, from, to);

  const rows = await prisma.smsMessage.findMany({
    where,
    select: {
      createdAt: true, status: true, destinationAddr: true,
      providerId: true, campaignId: true, cost: true,
    },
  });

  const dayBuckets: Record<string, { sent: number; delivered: number; failed: number; cost: number }> = {};
  const dlrBreakdown: Record<string, number> = {};
  const dimBreakdown: Record<string, { sent: number; delivered: number; failed: number; cost: number }> = {};

  const dayMs = 86_400_000;
  for (let t = from.getTime(); t <= to.getTime(); t += dayMs) {
    const key = new Date(t).toISOString().slice(0, 10);
    dayBuckets[key] = { sent: 0, delivered: 0, failed: 0, cost: 0 };
  }

  const providerIds = new Set<string>();
  const campaignIds = new Set<string>();
  for (const r of rows) {
    if (r.providerId) providerIds.add(r.providerId);
    if (r.campaignId) campaignIds.add(r.campaignId);
  }
  const [providers, campaigns] = await Promise.all([
    providerIds.size ? prisma.smsProvider.findMany({ where: { id: { in: Array.from(providerIds) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    campaignIds.size ? prisma.campaign.findMany({ where: { id: { in: Array.from(campaignIds) } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const nameOf = (id: string | null, list: Array<{ id: string; name: string }>) =>
    list.find((x) => x.id === id)?.name ?? "—";

  const dim = filters.dimension ?? "provider";

  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const bucket = dayBuckets[day];
    const cost = Number(r.cost ?? 0);
    if (bucket) {
      bucket.sent++;
      bucket.cost += cost;
      if (r.status === "DELIVERED") bucket.delivered++;
      else if (r.status === "FAILED" || r.status === "EXPIRED" || r.status === "REJECTED") bucket.failed++;
    }
    dlrBreakdown[r.status] = (dlrBreakdown[r.status] ?? 0) + 1;

    let dimKey = "—";
    if (dim === "provider") dimKey = nameOf(r.providerId, providers);
    else if (dim === "campaign") dimKey = nameOf(r.campaignId, campaigns);
    else if (dim === "country") dimKey = countryFromDest(r.destinationAddr.replace(/^\+/, ""));

    const slot = dimBreakdown[dimKey] ?? { sent: 0, delivered: 0, failed: 0, cost: 0 };
    slot.sent++;
    slot.cost += cost;
    if (r.status === "DELIVERED") slot.delivered++;
    else if (r.status === "FAILED" || r.status === "EXPIRED" || r.status === "REJECTED") slot.failed++;
    dimBreakdown[dimKey] = slot;
  }

  let cum = 0;
  const costCurve = Object.entries(dayBuckets).map(([date, v]) => {
    cum += v.cost;
    return { date, cost: Math.round(cum * 100) / 100 };
  });

  return {
    ok: true as const,
    data: {
      range: { from: from.toISOString(), to: to.toISOString() },
      total: rows.length,
      timeseries: Object.entries(dayBuckets).map(([date, v]) => ({ date, ...v })),
      dlrBreakdown: Object.entries(dlrBreakdown).map(([status, count]) => ({ status, count })),
      dimension: dim,
      dimensionBreakdown: Object.entries(dimBreakdown).map(([label, v]) => ({
        label,
        ...v,
        deliveryRate: v.sent > 0 ? Math.round((v.delivered / v.sent) * 1000) / 10 : 0,
      })),
      costCurve,
    },
  };
}

export async function exportReportCsvAction(filters: ReportFilters) {
  const g = await requirePermission("reports:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const report = await getReportAction(filters);
  if (!report.ok) return report;

  const escape = (v: unknown) => `\"${String(v ?? "").replace(/\"/g, '\"\"')}\"`;
  const lines: string[] = [];
  lines.push(["date", "sent", "delivered", "failed", "cost"].join(","));
  for (const r of report.data.timeseries) {
    lines.push([r.date, r.sent, r.delivered, r.failed, r.cost].map(escape).join(","));
  }
  lines.push("");
  lines.push([`Breakdown par ${report.data.dimension}`].join(","));
  lines.push(["label", "sent", "delivered", "failed", "deliveryRate%", "cost"].join(","));
  for (const r of report.data.dimensionBreakdown) {
    lines.push([r.label, r.sent, r.delivered, r.failed, r.deliveryRate, r.cost].map(escape).join(","));
  }
  return { ok: true as const, csv: "\uFEFF" + lines.join("\n") };
}

export async function exportReportPdfAction(filters: ReportFilters) {
  const g = await requirePermission("reports:view");
  if (!g.ok) return { ok: false as const, error: g.error };

  const report = await getReportAction(filters);
  if (!report.ok) return report;

  try {
    const { jsPDF } = await import("jspdf");
    const autoTableMod = await import("jspdf-autotable");
    const autoTable = (autoTableMod as unknown as { default?: typeof autoTableMod }).default ?? autoTableMod;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("SMS Gateway Pro \u2014 Rapport", 14, 18);
    doc.setFontSize(10);
    doc.text(`P\u00e9riode : ${report.data.range.from.slice(0, 10)} \u2192 ${report.data.range.to.slice(0, 10)}`, 14, 26);
    doc.text(`Total messages : ${report.data.total}`, 14, 32);

    (autoTable as unknown as (doc: unknown, opts: unknown) => void)(doc, {
      startY: 40,
      head: [["Date", "Envoy\u00e9s", "Livr\u00e9s", "\u00c9chou\u00e9s", "Co\u00fbt"]],
      body: report.data.timeseries.map((r) => [r.date, r.sent, r.delivered, r.failed, r.cost.toFixed(2)]),
      styles: { fontSize: 8 },
    });

    (autoTable as unknown as (doc: unknown, opts: unknown) => void)(doc, {
      head: [[`Par ${report.data.dimension}`, "Envoy\u00e9s", "Livr\u00e9s", "\u00c9chou\u00e9s", "Taux", "Co\u00fbt"]],
      body: report.data.dimensionBreakdown.map((r) => [r.label, r.sent, r.delivered, r.failed, `${r.deliveryRate}%`, r.cost.toFixed(2)]),
      styles: { fontSize: 8 },
    });

    const pdfBase64 = doc.output("datauristring").split(",")[1] ?? "";
    return { ok: true as const, base64: pdfBase64, filename: `report-${Date.now()}.pdf` };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "exportReportPdfAction failed");
    return { ok: false as const, error: "Impossible de g\u00e9n\u00e9rer le PDF." };
  }
}

// ---------- Scheduled reports (BullMQ repeatable jobs) ----------

export async function scheduleReportAction(input: ScheduleReportInput) {
  const g = await requirePermission("reports:create");
  if (!g.ok) return { ok: false as const, error: g.error };
  if (!input.recipients?.length) return { ok: false as const, error: "Au moins un destinataire requis." };
  try {
    const result = await scheduleReportViaBridge({
      ...input,
      organizationId: g.ctx.organizationId,
      userEmail: g.ctx.email,
    });
    return { ok: true as const, jobId: result.jobId };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "scheduleReportAction failed");
    return { ok: false as const, error: "Erreur lors de la planification." };
  }
}

export async function listScheduledReportsAction() {
  const g = await requirePermission("reports:view");
  if (!g.ok) return { ok: false as const, data: [], error: g.error };
  try {
    const result = await listScheduledReportsFromBridge();
    return { ok: true as const, data: result.data };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "listScheduledReportsAction failed");
    return { ok: false as const, data: [], error: "Erreur." };
  }
}

export async function cancelScheduledReportAction(key: string) {
  const g = await requirePermission("reports:delete");
  if (!g.ok) return { ok: false as const, error: g.error };
  try {
    await cancelScheduledReportViaBridge(key);
    return { ok: true as const };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "cancelScheduledReportAction failed");
    return { ok: false as const, error: "Erreur." };
  }
}
