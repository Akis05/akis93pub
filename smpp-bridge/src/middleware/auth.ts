import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "node:crypto";
import { loadBridgeEnv } from "../env.js";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const bearerAuth = createMiddleware(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = header.slice(7);
  const { BRIDGE_API_KEY } = loadBridgeEnv();
  if (!safeCompare(token, BRIDGE_API_KEY)) {
    return c.json({ error: "Invalid API key" }, 403);
  }
  await next();
});
