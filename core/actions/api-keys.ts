"use server";

import { createApiToken, listTokens, revokeTokenById } from "@/core/lib/api-auth";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { revalidatePath } from "next/cache";

export interface CreateTokenResult {
  success: boolean;
  token?: string;
  id?: string;
  name?: string;
  expiresAt?: string | null;
  error?: string;
}

export async function createTokenAction(
  name: string,
  expiresInHours?: number
): Promise<CreateTokenResult> {
  const g = await requirePermission("apikeys:create");
  if (!g.ok) return { success: false, error: g.error };

  if (!name || name.trim().length === 0 || name.length > 100) {
    return { success: false, error: "Le nom doit contenir entre 1 et 100 caractères." };
  }

  try {
    const token = await createApiToken(
      g.ctx.organizationId,
      g.ctx.userId,
      name.trim(),
      expiresInHours
    );
    revalidatePath("/api-keys");
    return {
      success: true,
      token: token.token,
      id: token.id,
      name: token.name,
      expiresAt: token.expiresAt?.toISOString() ?? null,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    };
  }
}

export async function revokeTokenByIdAction(
  tokenId: string
): Promise<{ success: boolean; error?: string }> {
  const g = await requirePermission("apikeys:delete");
  if (!g.ok) return { success: false, error: g.error };

  try {
    const revoked = await revokeTokenById(tokenId, g.ctx.organizationId);
    revalidatePath("/api-keys");
    return { success: revoked, error: revoked ? undefined : "Token introuvable" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erreur inconnue" };
  }
}

export async function listTokensAction() {
  const g = await requirePermission("apikeys:view");
  if (!g.ok) return [];
  return listTokens(g.ctx.organizationId);
}
