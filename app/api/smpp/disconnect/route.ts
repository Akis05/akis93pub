import { NextResponse } from "next/server";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { logger } from "@/core/lib/logger";
import { smppDisconnectViaBridge } from "@/core/lib/bridge-client";

/**
 * POST /api/smpp/disconnect
 *
 * Proxies to the SMPP Bridge, which gracefully unbinds and closes the
 * default SMPP session.
 */
export async function POST() {
  const guard = await requirePermission("connectors:update");
  if (!guard.ok) {
    return NextResponse.json({ success: false, error: guard.error || "Unauthorized" }, { status: guard.status || 401 });
  }

  try {
    const result = await smppDisconnectViaBridge();
    logger.info({ disconnected: result.disconnected }, "SMPP disconnect (via bridge)");
    return NextResponse.json({ success: true, message: result.message, state: "disconnected" });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "SMPP disconnect failed");
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
