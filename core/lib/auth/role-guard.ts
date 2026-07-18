import { orgGuard, type AuthContext, type GuardResult } from "./org-guard";

/**
 * Per-permission guard. SUPER_ADMIN bypasses all checks.
 */
export async function requirePermission(permission: string): Promise<GuardResult> {
  const guard = await orgGuard();
  if (!guard.ok) return guard;
  if (!hasPermission(guard.ctx, permission)) {
    return { ok: false, status: 403, error: `Missing permission: ${permission}` };
  }
  return guard;
}

export function hasPermission(ctx: AuthContext, permission: string): boolean {
  if (ctx.role === "SUPER_ADMIN") return true;
  return ctx.permissions.includes(permission);
}

export async function requireRole(...allowedRoles: string[]): Promise<GuardResult> {
  const guard = await orgGuard();
  if (!guard.ok) return guard;
  if (!allowedRoles.includes(guard.ctx.role)) {
    return {
      ok: false,
      status: 403,
      error: `Role ${guard.ctx.role} not allowed (required: ${allowedRoles.join(", ")})`,
    };
  }
  return guard;
}
