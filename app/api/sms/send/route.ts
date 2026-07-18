import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/core/lib/api-auth";
import { sendSmsSchema, normalizePhone } from "@/core/lib/validations";
import { logger } from "@/core/lib/logger";
import prisma from "@/core/lib/prisma";
import { sendSmsViaBridge } from "@/core/lib/bridge-client";
import { requiresUnicode, computeSegments } from "@/core/lib/sms-encoding";

/**
 * POST /api/sms/send
 *
 * Authentication options:
 *   - Authorization: Bearer <api_token>  (legacy token store)
 *   - Supabase session + sms:send RBAC permission (cookie-based)
 *
 * Body:
 *   {
 *     "to": "+33612345678",
 *     "text": "Hello!",
 *     "from": "MYBRAND"          (optional, defaults to SMPP_SOURCE_ADDR)
 *     "connectorId": "<uuid>"    (optional; only used for routing metadata, not required to send)
 *     "requestDlr": true          (optional)
 *     "scheduledAt": "2026-06-23T18:00:00Z"  (optional ISO date; BullMQ delays the job)
 *   }
 */

export async function POST(request: NextRequest) {
  // --- 1. Authenticate ---
  let organizationId: string | null = null;
  let actorEmail = "api-token";

  const auth = await authenticateRequest(request);
  if (!auth) {
    const { requirePermission } = await import("@/core/lib/auth/role-guard");
    const guard = await requirePermission("sms:send");
    if (!guard.ok) {
      const authHeader = request.headers.get("authorization");
      const reason = !authHeader
        ? "missing_authorization_header"
        : !authHeader.startsWith("Bearer ")
        ? "malformed_authorization_header"
        : "invalid_or_expired_token";
      logger.warn({ reason, guardError: guard.error }, "API: /api/sms/send auth failed");
      return NextResponse.json(
        { success: false, error: guard.error || "Unauthorized", reason },
        { status: guard.status || 401 }
      );
    }
    organizationId = guard.ctx.organizationId;
    actorEmail = guard.ctx.email;
  } else {
    // API token: the organization is resolved from the ApiKey record itself.
    organizationId = auth.organizationId;
    actorEmail = `api-token:${auth.name}`;
  }

  // --- 2. Parse body ---
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sendSmsSchema.safeParse({
    to: normalizePhone(String(body.to ?? "")),
    text: body.text,
    from: body.from,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 422 }
    );
  }

  const { to, text, from } = parsed.data;
  const requestDlr = body.requestDlr !== false;
  const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;

  // --- 3. Resolve connector (explicit > routing engine > first BOUND fallback) ---
  const connectorId = (body.connectorId as string) || null;
  let connector = connectorId
    ? await prisma.smsProvider.findFirst({
        where: { id: connectorId, organizationId, deletedAt: null },
      })
    : null;

  let routeId: string | null = null;
  if (!connector) {
    const { resolveRouteForDestination } = await import("@/core/actions/routes");
    const route = await resolveRouteForDestination(organizationId, to);
    routeId = route.routeId;
    if (route.providerId) {
      connector = await prisma.smsProvider.findFirst({
        where: { id: route.providerId, organizationId, deletedAt: null },
      });
    }
  }

  // Connector (SmsProvider) rows are optional metadata for future
  // multi-provider routing — the actual send always goes through the single
  // env-configured SMPP session held by the SMPP Bridge (see smpp-bridge/),
  // so a missing row must never block sending (mirrors sendSmsViaSmpp, used
  // by the dashboard's /sms/send page, which never requires one either).
  const sourceAddr = (from?.trim() || process.env.SMPP_SOURCE_ADDR) ?? "GATEWAY";
  const unicode = requiresUnicode(text);
  const encoding = unicode ? "UCS2" : "GSM7";
  const segments = computeSegments(text, unicode);

  // --- 4. Reject blacklisted destinations (opt-out) ---
  const optedOut = await prisma.contact.findFirst({
    where: { organizationId, phone: to, isBlacklisted: true, deletedAt: null },
    select: { id: true },
  });
  if (optedOut) {
    return NextResponse.json(
      { success: false, error: "Destination has opted out (blacklisted)" },
      { status: 403 }
    );
  }

  // --- 5. Persist as QUEUED (or PENDING if scheduled) ---
  const isScheduled = scheduledAt && scheduledAt.getTime() > Date.now();
  const msg = await prisma.smsMessage.create({
    data: {
      direction: "OUTBOUND",
      sourceAddr,
      destinationAddr: to,
      content: text,
      encoding,
      segments,
      status: isScheduled ? "PENDING" : "QUEUED",
      providerId: connector?.id,
      routeId: routeId ?? undefined,
      organizationId,
      ...(isScheduled ? { scheduledAt } : {}),
    },
  });

  // --- 6. Enqueue via the SMPP Bridge (delayed if scheduled) ---
  try {
    await sendSmsViaBridge({
      to,
      text,
      from: sourceAddr,
      requestDeliveryReceipt: requestDlr,
      externalId: msg.id,
      organizationId: organizationId!,
      ...(isScheduled ? { scheduledAt: scheduledAt!.getTime() } : {}),
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, messageId: msg.id }, "Bridge enqueue failed");
    await prisma.smsMessage.update({
      where: { id: msg.id },
      data: { status: "FAILED", dlrErrorCode: "ENQUEUE_FAILED" },
    });
    return NextResponse.json(
      { success: false, error: "Failed to enqueue message" },
      { status: 500 }
    );
  }

  logger.info(
    { messageId: msg.id, to, segments, scheduled: !!isScheduled, actor: actorEmail },
    "SMS accepted via API"
  );

  return NextResponse.json(
    {
      success: true,
      data: {
        messageId: msg.id,
        to,
        from: sourceAddr,
        segments,
        encoding,
        status: msg.status,
        scheduledAt: msg.scheduledAt,
      },
    },
    { status: 202 }
  );
}
