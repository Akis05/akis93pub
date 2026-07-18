import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/core/lib/api-auth";
import { logger } from "@/core/lib/logger";
import { getSmppStatusFromBridge } from "@/core/lib/bridge-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/smpp/state
 *
 * Public-API view of the live SMPP connection state (proxied from the SMPP
 * Bridge), authenticated with an API token (Authorization: Bearer <token>)
 * or a Supabase session with the `smpp:view` permission.
 *
 * Unlike the internal /api/smpp/status endpoint (used by the dashboard and
 * session-protected), this endpoint is meant for external integrations that
 * want to poll the gateway health. It NEVER creates a session, it only reads.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    const { requirePermission } = await import("@/core/lib/auth/role-guard");
    const guard = await requirePermission("smpp:view");
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: guard.error || "Unauthorized" },
        { status: guard.status || 401 }
      );
    }
  }

  try {
    const bridgeStatus = await getSmppStatusFromBridge();
    const sessions = bridgeStatus.sessions;
    const sessionCount = sessions.length;
    const boundCount = sessions.filter((s) => s.connected).length;
    const def = sessions.find((s) => s.key === "__env__") ?? null;

    return NextResponse.json({
      success: true,
      data: {
        connected: boundCount > 0,
        state: def?.state ?? "disconnected",
        sessionCount,
        boundCount,
        default: def
          ? {
              state: def.state,
              connected: def.connected,
              host: def.host,
              port: def.port,
              systemId: def.systemId,
              bindMode: def.bindMode,
              sourceAddr: def.sourceAddr,
              tls: def.tls,
            }
          : {
              state: "disconnected",
              connected: false,
              host: null,
              port: null,
              systemId: null,
            },
        sessions,
      },
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "GET /api/smpp/state failed");
    return NextResponse.json(
      { success: false, error: "Failed to read SMPP state" },
      { status: 500 }
    );
  }
}
