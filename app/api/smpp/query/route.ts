import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/core/lib/api-auth";
import { logger } from "@/core/lib/logger";
import { smppQueryViaBridge, BridgeError } from "@/core/lib/bridge-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/smpp/query?id=<smsc_message_id>
 *
 * Proxies a query_sm request to the SMPP Bridge, which fetches the live
 * state of a message previously returned by submit_sm.
 *
 * Authentication:
 *   - Authorization: Bearer <api_token>, OR
 *   - Supabase session + sms:view RBAC permission
 */
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    const { requirePermission } = await import("@/core/lib/auth/role-guard");
    const guard = await requirePermission("sms:view");
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: guard.error || "Unauthorized" },
        { status: guard.status || 401 }
      );
    }
  }

  const messageId = request.nextUrl.searchParams.get("id")?.trim();
  if (!messageId) {
    return NextResponse.json(
      { success: false, error: "Query param 'id' (SMSC message_id) is required" },
      { status: 400 }
    );
  }

  const sourceAddr = request.nextUrl.searchParams.get("from")?.trim() || undefined;

  try {
    const result = await smppQueryViaBridge(messageId, sourceAddr);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, messageId }, "query_sm request failed (via bridge)");
    const status = err instanceof BridgeError ? err.status : message.includes("timeout") ? 504 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
