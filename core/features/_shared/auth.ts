import "server-only";
import { orgGuard } from "@/core/lib/auth/org-guard";

export interface AuthContext {
  userId: string;
  organizationId: string;
  email: string;
  role: string;
}

/**
 * Resolves the current Supabase user + their Prisma User row + organizationId.
 * Returns null if the user is not authenticated or has no matching Prisma row.
 *
 * Used by every feature module's query/route layer to enforce multi-tenant
 * isolation: every Prisma query MUST filter on `organizationId`.
 *
 * Thin wrapper around {@link orgGuard} (the canonical auth resolver, which
 * also carries `permissions`) so the two auth mechanisms in this codebase
 * stay backed by a single Supabase+Prisma lookup instead of two divergent
 * implementations.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const guard = await orgGuard();
  if (!guard.ok) return null;
  return {
    userId: guard.ctx.userId,
    organizationId: guard.ctx.organizationId,
    email: guard.ctx.email,
    role: guard.ctx.role,
  };
}

/**
 * Stricter variant: throws if the user is not authenticated. Use this in
 * server actions / route handlers where unauthenticated access must be
 * a hard error.
 */
export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new UnauthorizedError("Authentification requise.");
  return ctx;
}

export class UnauthorizedError extends Error {
  status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  status = 404 as const;
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  status = 400 as const;
  constructor(message = "Validation failed", public readonly issues?: unknown) {
    super(message);
    this.name = "ValidationError";
  }
}
