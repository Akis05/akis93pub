import { NextResponse } from "next/server";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { logger } from "@/core/lib/logger";
import { smppDisconnectViaBridge } from "@/core/lib/bridge-client";

/**
 * POST /api/smpp/disconnect/[key]
 *
 * The gateway only ever operates a single env-based SMPP session on the
 * bridge, so any key disconnects that same default session.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const guard = await requirePermission("connectors:update");
  if (!guard.ok) {
    return NextResponse.json({ success: false, error: guard.error || "Unauthorized" }, { status: guard.status || 401 });
  }

  const { key } = await params;
  try {
    const result = await smppDisconnectViaBridge();
    logger.info({ key, disconnected: result.disconnected }, "SMPP disconnect (targeted, via bridge)");

    if (!result.disconnected) {
      return NextResponse.json(
        { success: false, error: `Aucune session ouverte pour la clé: ${key}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, key, remaining: 0 });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err, key }, "SMPP disconnect (targeted) failed");
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
