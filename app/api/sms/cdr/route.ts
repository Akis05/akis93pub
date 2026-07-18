import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/core/lib/api-auth";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { MAX_VALIDITY_MS } from "@/core/actions/cdr";

export const dynamic = "force-dynamic";

const STORE_STATUSES = ["PENDING", "QUEUED", "SENDING", "SENT"];

/**
 * GET /api/sms/cdr
 *
 * Authentication:
 *   - Authorization: Bearer <api_token>, OR
 *   - Supabase session + sms:view RBAC permission
 *
 * Query params:
 *   - id=<messageId|providerMessageId>  -> full CDR for one SMS
 *   - (none)                            -> store summary (count of SMS still waiting)
 */
export async function GET(request: NextRequest) {
  // --- Authenticate (mirrors /api/sms/send) ---
  let organizationId: string | null = null;

  const auth = await authenticateRequest(request);
  if (!auth) {
    const { requirePermission } = await import("@/core/lib/auth/role-guard");
    const guard = await requirePermission("sms:view");
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: guard.error || "Unauthorized" },
        { status: guard.status || 401 }
      );
    }
    organizationId = guard.ctx.organizationId;
  } else {
    organizationId = auth.organizationId;
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();

  // --- Single CDR lookup ---
  if (id) {
    const m = await prisma.smsMessage.findFirst({
      where: { organizationId, OR: [{ id }, { providerMessageId: id }] },
      include: { provider: { select: { name: true } }, campaign: { select: { name: true } } },
    });
    if (!m) {
      return NextResponse.json({ success: false, error: "SMS not found" }, { status: 404 });
    }

    const inStore = STORE_STATUSES.includes(m.status);
    const reference = m.sentAt ?? m.createdAt;
    const storeAgeMs = inStore ? Date.now() - reference.getTime() : null;
    const expired = m.status === "EXPIRED" || (inStore && storeAgeMs !== null && storeAgeMs > MAX_VALIDITY_MS);

    return NextResponse.json({
      success: true,
      data: {
        messageId: m.id,
        providerMessageId: m.providerMessageId,
        direction: m.direction,
        from: m.sourceAddr,
        to: m.destinationAddr,
        content: m.content,
        encoding: m.encoding,
        segments: m.segments,
        status: m.status,
        dlrStatus: m.dlrStatus,
        delivered: m.status === "DELIVERED" || m.dlrStatus === "DELIVRD",
        errorCode: m.dlrErrorCode,
        inStore,
        storeAgeMs,
        expired,
        cost: m.cost ? m.cost.toString() : null,
        connectorName: m.provider?.name ?? null,
        campaignName: m.campaign?.name ?? null,
        createdAt: m.createdAt.toISOString(),
        sentAt: m.sentAt?.toISOString() ?? null,
        deliveredAt: m.deliveredAt?.toISOString() ?? null,
        dlrReceivedAt: m.dlrReceivedAt?.toISOString() ?? null,
      },
    });
  }

  // --- Store summary ---
  try {
    const where = {
      organizationId,
      direction: "OUTBOUND" as const,
      status: { in: STORE_STATUSES as never },
    };
    const grouped = await prisma.smsMessage.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    let inStore = 0;
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
      inStore += row._count._all;
    }
    const expiredInStore = await prisma.smsMessage.count({
      where: { ...where, createdAt: { lt: new Date(Date.now() - MAX_VALIDITY_MS) } },
    });

    return NextResponse.json({
      success: true,
      data: { inStore, byStatus, expiredInStore, maxValidityDays: 7 },
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "GET /api/sms/cdr store summary failed");
    return NextResponse.json({ success: false, error: "Failed to compute store summary" }, { status: 500 });
  }
}
