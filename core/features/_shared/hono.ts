import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { getAuthContext, type AuthContext } from "./auth";

/**
 * Standard Hono Variables map every feature route mounts on.
 * Add `auth` (set by the auth middleware) and you can access it via
 * `c.get("auth")` in any handler.
 */
export type AppVariables = {
  auth: AuthContext;
};

export type AppEnv = { Variables: AppVariables };

/**
 * Builds a Hono sub-app with multi-tenant auth pre-wired. Every handler
 * mounted on this app can safely call `c.get("auth")` and rely on
 * `c.get("auth").organizationId` being set.
 */
export function createFeatureApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", authMiddleware);
  return app;
}

/**
 * Hono middleware: resolves the Supabase session + Prisma user row, then
 * attaches the auth context to the request. Returns 401 if missing.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ctx = await getAuthContext();
  if (!ctx) {
    return c.json({ error: "Authentification requise." }, 401);
  }
  c.set("auth", ctx);
  await next();
};

/**
 * Helper: maps a thrown Error to an HTTP JSON response with the right
 * status code (using the `status` property set by the shared error classes).
 */
export function errorResponse(c: Context, e: unknown) {
  if (e instanceof Error && "status" in e && typeof (e as { status?: unknown }).status === "number") {
    const status = (e as { status: number }).status;
    return c.json({ error: e.message }, status as 400 | 401 | 403 | 404 | 500);
  }
  return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
}
