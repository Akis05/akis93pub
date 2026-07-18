import { NextResponse } from "next/server";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { logger } from "@/core/lib/logger";
import { getSmppStatusFromBridge } from "@/core/lib/bridge-client";

/**
 * GET /api/smpp/status
 *
 * Proxies the SMPP Bridge's live session inventory. The bridge holds the
 * actual SMPP session (see smpp-bridge/); this app never binds directly.
 *
 * This endpoint NEVER creates a session — it only reads existing ones.
 */
export async function GET() {
  const guard = await requirePermission("connectors:view");
  if (!guard.ok) {
    return NextResponse.json({ success: false, error: guard.error || "Unauthorized" }, { status: guard.status || 401 });
  }

  try {
    const bridgeStatus = await getSmppStatusFromBridge();
    const defaultSession = bridgeStatus.sessions.find((s) => s.key === "__env__") ?? null;
    const count = bridgeStatus.sessions.length;
    const boundCount = bridgeStatus.sessions.filter((s) => s.connected).length;

    if (!defaultSession) {
      return NextResponse.json({
        state: "disconnected",
        connected: false,
        host: null,
        port: null,
        systemId: null,
        sessions: bridgeStatus.sessions,
        count,
        boundCount,
      });
    }

    return NextResponse.json({
      state: defaultSession.state,
      connected: defaultSession.connected,
      host: defaultSession.host,
      port: defaultSession.port,
      systemId: defaultSession.systemId,
      bindMode: defaultSession.bindMode,
      sourceAddr: defaultSession.sourceAddr,
      tls: defaultSession.tls,
      sessions: bridgeStatus.sessions,
      count,
      boundCount,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "GET /api/smpp/status failed");
    return NextResponse.json({
      state: "disconnected",
      connected: false,
      host: null,
      port: null,
      sessions: [],
      count: 0,
      boundCount: 0,
    });
  }
}
