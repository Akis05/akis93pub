import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/core/lib/api-auth";
import prisma from "@/core/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/sms/status?messageId=<uuid>
 *
 * Authentication:
 *   - Authorization: Bearer <api_token>, OR
 *   - Supabase session + sms:view RBAC permission
 *
 * Query params:
 *   - messageId (or id)  -> the messageId returned by POST /api/sms/send
 */
export async function GET(request: NextRequest) {
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

  const messageId =
    request.nextUrl.searchParams.get("messageId")?.trim() ||
    request.nextUrl.searchParams.get("id")?.trim();

  if (!messageId) {
    return NextResponse.json(
      { success: false, error: "Missing required query param: messageId" },
      { status: 400 }
    );
  }

  const m = await prisma.smsMessage.findFirst({
    where: { organizationId, OR: [{ id: messageId }, { providerMessageId: messageId }] },
    select: {
      id: true,
      providerMessageId: true,
      destinationAddr: true,
      sourceAddr: true,
      status: true,
      dlrStatus: true,
      dlrErrorCode: true,
      segments: true,
      createdAt: true,
      sentAt: true,
      deliveredAt: true,
      dlrReceivedAt: true,
    },
  });

  if (!m) {
    return NextResponse.json({ success: false, error: "SMS not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      messageId: m.id,
      providerMessageId: m.providerMessageId,
      to: m.destinationAddr,
      from: m.sourceAddr,
      status: m.status,
      dlrStatus: m.dlrStatus,
      delivered: m.status === "DELIVERED" || m.dlrStatus === "DELIVRD",
      errorCode: m.dlrErrorCode,
      segments: m.segments,
      createdAt: m.createdAt.toISOString(),
      sentAt: m.sentAt?.toISOString() ?? null,
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      dlrReceivedAt: m.dlrReceivedAt?.toISOString() ?? null,
    },
  });
}
