import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";

// ============================================
// API Token store (persisted in the DB via the ApiKey model).
//
// Security model:
//   - The raw token is returned to the caller exactly once, at creation.
//   - Only a SHA-256 hash of the token is stored (keyHash, unique).
//   - A short, non-sensitive prefix (keyPrefix) is stored for display.
//   - Validation hashes the incoming token and looks it up by hash, so
//     the plaintext token never has to be persisted or compared directly.
// ============================================

export interface ApiToken {
  id: string;
  token: string; // only populated at creation time
  name: string;
  createdAt: Date;
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  organizationId: string;
}

export interface ApiTokenSummary {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: Date;
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
}

const TOKEN_PREFIX = "sgp_";

/** Generate a secure random token string. */
function generateTokenString(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
}

/** SHA-256 hash of a token, used as the stored lookup key. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new API token for an organization. The raw token is returned
 * once; only its hash is stored.
 */
export async function createApiToken(
  organizationId: string,
  userId: string,
  name: string,
  expiresInHours?: number
): Promise<ApiToken> {
  const raw = generateTokenString();
  const keyHash = hashToken(raw);
  const keyPrefix = raw.slice(0, 12);
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3_600_000)
    : null;

  const record = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      keyPrefix,
      expiresAt,
      organizationId,
      userId,
    },
    select: { id: true, name: true, createdAt: true, expiresAt: true, organizationId: true },
  });

  logger.info({ tokenId: record.id, name, organizationId }, "API token created");

  return {
    id: record.id,
    token: raw,
    name: record.name,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    organizationId: record.organizationId,
  };
}

/**
 * Validate a raw Bearer token. Returns the token record (without the raw
 * value) if valid and not expired/revoked, null otherwise.
 */
export async function validateToken(tokenString: string): Promise<Omit<ApiToken, "token"> | null> {
  if (!tokenString || !tokenString.startsWith(TOKEN_PREFIX)) return null;

  const keyHash = hashToken(tokenString);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true, name: true, createdAt: true, lastUsedAt: true,
      expiresAt: true, revokedAt: true, organizationId: true,
    },
  });

  if (!record || record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  // Best-effort lastUsedAt update; never block auth on this.
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch((err) => logger.warn({ err: (err as Error).message }, "lastUsedAt update failed"));

  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    organizationId: record.organizationId,
  };
}

/**
 * Extract and validate a Bearer token from a NextRequest.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<Omit<ApiToken, "token"> | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const tokenString = authHeader.slice(7).trim();
  return validateToken(tokenString);
}

/** Revoke a token by its ID, scoped to an organization. */
export async function revokeTokenById(
  tokenId: string,
  organizationId: string
): Promise<boolean> {
  const result = await prisma.apiKey.updateMany({
    where: { id: tokenId, organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/** List active (non-revoked) tokens for an organization, without exposing the raw token. */
export async function listTokens(organizationId: string): Promise<ApiTokenSummary[]> {
  const rows = await prisma.apiKey.findMany({
    where: { organizationId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, keyPrefix: true, createdAt: true,
      lastUsedAt: true, expiresAt: true,
    },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    tokenPreview: `${t.keyPrefix}...`,
    createdAt: t.createdAt,
    lastUsedAt: t.lastUsedAt,
    expiresAt: t.expiresAt,
  }));
}
