"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { requirePermission } from "@/core/lib/auth/role-guard";
import { orgGuard, assertSameOrg } from "@/core/lib/auth/org-guard";

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  permissions: string[];
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  createdAt: Date;
  lastSignInAt: Date | null;
};

export async function listUsersAction(): Promise<{ data?: UserRow[]; error?: string }> {
  const g = await requirePermission("users:view");
  if (!g.ok) return { error: g.error };

  const users = await prisma.user.findMany({
    where: { organizationId: g.ctx.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, name: true, role: true, permissions: true,
      createdAt: true, deletedAt: true, supabaseUserId: true,
    },
  });

  const data: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    permissions: u.permissions,
    status: u.deletedAt
      ? "SUSPENDED"
      : u.supabaseUserId.startsWith("invited:")
      ? "INVITED"
      : "ACTIVE",
    createdAt: u.createdAt,
    lastSignInAt: null,
  }));
  return { data };
}

function defaultPermissionsForRole(role: string): string[] {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return [
        "users:view", "users:create", "users:update", "users:delete",
        "sms:view", "sms:send", "contacts:view", "contacts:create", "contacts:update",
        "campaigns:view", "campaigns:create", "connectors:view", "reports:view",
        "billing:view", "audit:view", "settings:view", "settings:update",
      ];
    case "OPERATOR":
      return ["sms:view", "sms:send", "contacts:view", "campaigns:view"];
    case "DEVELOPER":
      return ["sms:view", "sms:send", "apiKeys:view", "apiKeys:create", "webhooks:view"];
    case "VIEWER":
    default:
      return ["sms:view", "contacts:view", "campaigns:view", "reports:view"];
  }
}

async function sendInvitationEmail(email: string, orgName: string, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn({ email }, "RESEND_API_KEY missing \u2014 invitation email skipped");
    return;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/signup?invite=${token}`;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "SMS Gateway Pro <no-reply@sms-gateway.pro>",
      to: email,
      subject: `Invitation \u00e0 rejoindre ${orgName}`,
      html: `<p>Bonjour,</p><p>Vous \u00eates invit\u00e9(e) \u00e0 rejoindre <strong>${orgName}</strong> sur SMS Gateway Pro.</p><p><a href="${link}">Cr\u00e9er mon compte</a> (lien valide 48h)</p>`,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, email }, "Failed to send invitation email");
  }
}

export async function inviteUserAction(input: {
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER";
  name?: string;
}): Promise<{ ok?: true; error?: string }> {
  const g = await requirePermission("users:create");
  if (!g.ok) return { error: g.error };

  try {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) return { error: "Un utilisateur avec cet email existe d\u00e9j\u00e0." };

    const inviteToken = crypto.randomUUID();
    await prisma.user.create({
      data: {
        email: input.email,
        name: input.name ?? null,
        role: input.role,
        permissions: defaultPermissionsForRole(input.role),
        organizationId: g.ctx.organizationId,
        supabaseUserId: `invited:${inviteToken}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "create",
        entity: "user",
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { invited: input.email, role: input.role },
        organizationId: g.ctx.organizationId,
      },
    });

    const org = await prisma.organization.findUnique({
      where: { id: g.ctx.organizationId },
      select: { name: true },
    });
    await sendInvitationEmail(input.email, org?.name ?? "votre organisation", inviteToken);

    revalidatePath("/users");
    return { ok: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "inviteUserAction failed");
    return { error: "Erreur lors de l'invitation." };
  }
}

export async function updateUserRoleAction(input: {
  userId: string;
  role: string;
  permissions?: string[];
}): Promise<{ ok?: true; error?: string }> {
  const g = await requirePermission("users:update");
  if (!g.ok) return { error: g.error };

  try {
    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { organizationId: true },
    });
    if (!target) return { error: "Utilisateur introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.user.update({
      where: { id: input.userId },
      data: {
        role: input.role as "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "DEVELOPER" | "VIEWER",
        permissions: input.permissions ?? defaultPermissionsForRole(input.role),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "update",
        entity: "user",
        entityId: input.userId,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { newRole: input.role },
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/users");
    return { ok: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "updateUserRoleAction failed");
    return { error: "Erreur lors de la mise \u00e0 jour." };
  }
}

export async function suspendUserAction(userId: string): Promise<{ ok?: true; error?: string }> {
  const g = await requirePermission("users:update");
  if (!g.ok) return { error: g.error };
  if (userId === g.ctx.userId) return { error: "Vous ne pouvez pas vous suspendre vous-m\u00eame." };

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!target) return { error: "Utilisateur introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });

    await prisma.auditLog.create({
      data: {
        action: "update",
        entity: "user",
        entityId: userId,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { event: "suspended" },
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/users");
    return { ok: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "suspendUserAction failed");
    return { error: "Erreur lors de la suspension." };
  }
}

export async function reactivateUserAction(userId: string): Promise<{ ok?: true; error?: string }> {
  const g = await requirePermission("users:update");
  if (!g.ok) return { error: g.error };
  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!target) return { error: "Utilisateur introuvable." };
    assertSameOrg(g.ctx, target.organizationId);
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: null } });
    revalidatePath("/users");
    return { ok: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "reactivateUserAction failed");
    return { error: "Erreur lors de la r\u00e9activation." };
  }
}

export async function deleteUserAction(userId: string): Promise<{ ok?: true; error?: string }> {
  const g = await requirePermission("users:delete");
  if (!g.ok) return { error: g.error };
  if (userId === g.ctx.userId) return { error: "Vous ne pouvez pas vous supprimer vous-m\u00eame." };
  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true, email: true },
    });
    if (!target) return { error: "Utilisateur introuvable." };
    assertSameOrg(g.ctx, target.organizationId);

    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });

    await prisma.auditLog.create({
      data: {
        action: "delete",
        entity: "user",
        entityId: userId,
        userId: g.ctx.userId,
        userEmail: g.ctx.email,
        details: { deletedEmail: target.email },
        organizationId: g.ctx.organizationId,
      },
    });

    revalidatePath("/users");
    return { ok: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "deleteUserAction failed");
    return { error: "Erreur lors de la suppression." };
  }
}

export async function getAuthContextAction() {
  const g = await orgGuard();
  if (!g.ok) return null;
  return g.ctx;
}
