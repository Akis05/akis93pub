import { NextRequest, NextResponse } from "next/server";
import {
  createApiToken,
  listTokens,
  revokeTokenById,
  authenticateRequest,
} from "@/core/lib/api-auth";
import { orgGuard } from "@/core/lib/auth/org-guard";

/**
 * POST /api/auth/token
 *
 * Generate a new API token for the caller's organization.
 * Requires a Supabase session (the org/user context is taken from it),
 * so tokens are always bound to a real organization.
 *
 * Body:
 *   { "name": "My Postman Token", "expiresInHours": 24 }
 *
 * Response (201):
 *   { "success": true, "data": { "token": "sgp_...", ... } }
 *
 * Note: The full token is only returned ONCE at creation time.
 */
export async function POST(request: NextRequest) {
  const guard = await orgGuard();
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, error: guard.error || "Unauthorized" },
      { status: guard.status || 401 }
    );
  }

  try {
    const body = await request.json();
    const name = body.name || "API Token";
    const expiresInHours = body.expiresInHours ?? undefined;

    if (typeof name !== "string" || name.length < 1 || name.length > 100) {
      return NextResponse.json(
        { success: false, error: "'name' must be a string (1-100 chars)" },
        { status: 400 }
      );
    }

    const token = await createApiToken(
      guard.ctx.organizationId,
      guard.ctx.userId,
      name,
      expiresInHours
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: token.id,
          token: token.token,
          name: token.name,
          createdAt: token.createdAt.toISOString(),
          expiresAt: token.expiresAt?.toISOString() ?? null,
        },
        message:
          "Token created. Save it now \u2014 it won't be shown again. " +
          "Use it as: Authorization: Bearer <token>",
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}

/**
 * GET /api/auth/token
 *
 * List active tokens for the authenticated organization.
 * Accepts an API token or a Supabase session.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  let organizationId: string;

  if (auth) {
    organizationId = auth.organizationId;
  } else {
    const guard = await orgGuard();
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Provide: Authorization: Bearer <token>" },
        { status: 401 }
      );
    }
    organizationId = guard.ctx.organizationId;
  }

  return NextResponse.json({
    success: true,
    data: await listTokens(organizationId),
  });
}

/**
 * DELETE /api/auth/token
 *
 * Revoke a token by its ID (scoped to the caller's organization).
 *
 * Body: { "id": "<tokenId>" }
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  let organizationId: string;

  if (auth) {
    organizationId = auth.organizationId;
  } else {
    const guard = await orgGuard();
    if (!guard.ok) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    organizationId = guard.ctx.organizationId;
  }

  try {
    const body = await request.json();
    const tokenId = body.id;

    if (!tokenId || typeof tokenId !== "string") {
      return NextResponse.json(
        { success: false, error: "'id' field is required" },
        { status: 400 }
      );
    }

    const revoked = await revokeTokenById(tokenId, organizationId);
    return NextResponse.json({
      success: revoked,
      message: revoked ? "Token revoked" : "Token not found",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
