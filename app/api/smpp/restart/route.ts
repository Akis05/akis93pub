import { NextResponse } from "next/server";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { logger } from "@/core/lib/logger";
import { smppRestartViaBridge } from "@/core/lib/bridge-client";

export async function POST() {
  const guard = await requirePermission("connectors:update");
  if (!guard.ok) {
    return NextResponse.json({ success: false, error: guard.error || "Unauthorized" }, { status: guard.status || 401 });
  }

  try {
    const result = await smppRestartViaBridge();
    logger.info({ state: result.state }, "SMPP restart (via bridge)");
    return NextResponse.json({
      success: result.state === "bound" || result.state === "connecting",
      message: result.message,
      state: result.state,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "SMPP restart failed");
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
