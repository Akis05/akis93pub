import { createSupabaseServerClient } from "@/core/lib/supabase/server";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
  email: string;
}

export type GuardResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: number; error: string };

/**
 * Resolves the current Supabase user and ensures they belong to a Prisma
 * organization. Returns the multi-tenant auth context.
 */
export async function orgGuard(): Promise<GuardResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return { ok: false, status: 401, error: "Not authenticated" };
    }

    const user = await prisma.user.findUnique({
      where: { supabaseUserId: authUser.id },
      select: {
        id: true, email: true, role: true, permissions: true,
        organizationId: true, deletedAt: true,
      },
    });

    if (!user) {
      logger.warn({ supabaseUserId: authUser.id }, "orgGuard: no Prisma user record");
      return { ok: false, status: 403, error: "User has no organization" };
    }
    if (user.deletedAt) {
      return { ok: false, status: 403, error: "User suspended or deleted" };
    }

    return {
      ok: true,
      ctx: {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        permissions: user.permissions ?? [],
        email: user.email,
      },
    };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "orgGuard failed");
    return { ok: false, status: 500, error: "Auth check failed" };
  }
}

/** Throws when target org doesn't match caller's org. */
export function assertSameOrg(ctx: AuthContext, targetOrganizationId: string): void {
  if (ctx.organizationId !== targetOrganizationId) {
    throw new Error("Cross-organization access denied");
  }
}
