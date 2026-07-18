import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/core/lib/api-auth";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/sms/dlr
 *
 * Fetch the delivery receipt (DLR) status of one or more outbound SMS.
 *
 * Authentication:
 *   - Authorization: Bearer <api_token>, OR
 *   - Supabase session + `sms:view` RBAC permission
 *
 * Query params (one of):
 *   - id=<messageId>               -> DLR for a single message (internal UUID)
 *   - providerMessageId=<smscId>   -> DLR for a single message (SMSC id)
 *   - (none)                       -> latest DLRs for the org (paginated)
 *
 * Optional (list mode):
 *   - limit=<n>      (default 50, max 200)
 *   - dlrStatus=<S>  filter by DLR status (DELIVRD, EXPIRED, UNDELIV, ...)
 */
export async function GET(request: NextRequest) {
  // --- Authenticate ---
  let organizationId: string;

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

  const params = request.nextUrl.searchParams;
  const id = params.get("id")?.trim();
  const providerMessageId = params.get("providerMessageId")?.trim();

  const toDlr = (m: {
    id: string;
    providerMessageId: string | null;
    destinationAddr: string;
    status: string;
    dlrStatus: string | null;
    dlrErrorCode: string | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    dlrReceivedAt: Date | null;
  }) => ({
    messageId: m.id,
    providerMessageId: m.providerMessageId,
    to: m.destinationAddr,
    status: m.status,
    dlrStatus: m.dlrStatus,
    delivered: m.status === "DELIVERED" || m.dlrStatus === "DELIVRD",
    errorCode: m.dlrErrorCode,
    sentAt: m.sentAt?.toISOString() ?? null,
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    dlrReceivedAt: m.dlrReceivedAt?.toISOString() ?? null,
  });

  const select = {
    id: true,
    providerMessageId: true,
    destinationAddr: true,
    status: true,
    dlrStatus: true,
    dlrErrorCode: true,
    sentAt: true,
    deliveredAt: true,
    dlrReceivedAt: true,
  } as const;

  try {
    // --- Single lookup ---
    if (id || providerMessageId) {
      const m = await prisma.smsMessage.findFirst({
        where: {
          organizationId,
          ...(id ? { id } : {}),
          ...(providerMessageId ? { providerMessageId } : {}),
        },
        select,
      });
      if (!m) {
        return NextResponse.json({ success: false, error: "SMS not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: toDlr(m) });
    }

    // --- List mode ---
    const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);
    const dlrStatus = params.get("dlrStatus")?.trim();

    const rows = await prisma.smsMessage.findMany({
      where: {
        organizationId,
        direction: "OUTBOUND",
        ...(dlrStatus ? { dlrStatus: dlrStatus as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select,
    });

    return NextResponse.json({
      success: true,
      data: rows.map(toDlr),
      count: rows.length,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "GET /api/sms/dlr failed");
    return NextResponse.json({ success: false, error: "Failed to fetch DLR" }, { status: 500 });
  }
}
