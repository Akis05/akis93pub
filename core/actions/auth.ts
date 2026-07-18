"use server";

import { createSupabaseServerClient } from "@/core/lib/supabase/server";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";

// ============================================
// All permissions for SUPER_ADMIN
// ============================================
const ALL_PERMISSIONS = [
  // SMS
  "sms:view", "sms:create", "sms:update", "sms:delete", "sms:send",
  // Contacts
  "contacts:view", "contacts:create", "contacts:update", "contacts:delete",
  // Groups
  "groups:view", "groups:create", "groups:update", "groups:delete",
  // Campaigns
  "campaigns:view", "campaigns:create", "campaigns:update", "campaigns:delete",
  // Templates
  "templates:view", "templates:create", "templates:update", "templates:delete",
  // Connectors
  "connectors:view", "connectors:create", "connectors:update", "connectors:delete",
  // Providers
  "providers:view", "providers:create", "providers:update", "providers:delete",
  // Sender IDs
  "senderIds:view", "senderIds:create", "senderIds:update", "senderIds:delete",
  // Routes
  "routes:view", "routes:create", "routes:update", "routes:delete",
  // Reports
  "reports:view", "reports:create", "reports:update", "reports:delete",
  // Billing
  "billing:view", "billing:create", "billing:update", "billing:delete",
  // API Keys
  "apiKeys:view", "apiKeys:create", "apiKeys:update", "apiKeys:delete",
  // Webhooks
  "webhooks:view", "webhooks:create", "webhooks:update", "webhooks:delete",
  // Users
  "users:view", "users:create", "users:update", "users:delete",
  // Audit
  "audit:view", "audit:create", "audit:update", "audit:delete",
  // Settings
  "settings:view", "settings:create", "settings:update", "settings:delete",
];

// ============================================
// Login Action
// ============================================
export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      logger.warn({ email: input.email, error: error.message }, "Login failed");

      // User-friendly error messages
      if (error.message.includes("Invalid login credentials")) {
        return { error: "Email ou mot de passe incorrect." };
      }
      if (error.message.includes("Email not confirmed")) {
        return { error: "Veuillez confirmer votre email avant de vous connecter." };
      }
      return { error: error.message };
    }

    logger.info({ email: input.email }, "User logged in");
    return {};
  } catch (err) {
    logger.error({ err }, "Login action error");
    return { error: "Erreur serveur. Veuillez réessayer." };
  }
}

// ============================================
// Signup Action — Creates SUPER_ADMIN
// ============================================
export async function signupAction(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
}): Promise<{ error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();

    // 1. Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          name: input.name,
          role: "SUPER_ADMIN",
        },
      },
    });

    if (authError) {
      logger.warn({ email: input.email, error: authError.message }, "Signup auth failed");

      if (authError.message.includes("already registered")) {
        return { error: "Un compte avec cet email existe déjà." };
      }
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: "Erreur lors de la création du compte." };
    }

    const supabaseUserId = authData.user.id;

    // 2. Create Organization in Prisma
    const slug = input.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      || `org-${Date.now()}`;

    const organization = await prisma.organization.create({
      data: {
        name: input.organizationName,
        slug: `${slug}-${Date.now().toString(36)}`,
        timezone: "Africa/Djibouti",
      },
    });

    // 3. Create User in Prisma with SUPER_ADMIN role and ALL permissions
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: "SUPER_ADMIN",
        permissions: ALL_PERMISSIONS,
        organizationId: organization.id,
        supabaseUserId,
      },
    });

    // 4. Create initial CreditBalance for the organization
    await prisma.creditBalance.create({
      data: {
        balance: 10000, // 10,000 DJF starting credits
        alertThreshold: 500,
        organizationId: organization.id,
      },
    });

    // 5. Create initial AuditLog entry
    await prisma.auditLog.create({
      data: {
        action: "create",
        entity: "user",
        entityId: user.id,
        userId: user.id,
        userEmail: input.email,
        details: {
          event: "account_created",
          role: "SUPER_ADMIN",
          organizationName: input.organizationName,
          permissionsCount: ALL_PERMISSIONS.length,
        },
        organizationId: organization.id,
      },
    });

    // 6. Auto sign-in after registration
    await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    logger.info(
      {
        email: input.email,
        userId: user.id,
        organizationId: organization.id,
        role: "SUPER_ADMIN",
      },
      "SUPER_ADMIN account created"
    );

    return {};
  } catch (err) {
    logger.error({ err }, "Signup action error");

    // Handle Prisma unique constraint errors
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: "Un compte avec cet email ou cette organisation existe déjà." };
    }

    return { error: "Erreur serveur lors de la création du compte. Veuillez réessayer." };
  }
}

// ============================================
// Logout Action
// ============================================
export async function logoutAction(): Promise<{ error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.warn({ error: error.message }, "Logout failed");
      return { error: error.message };
    }

    return {};
  } catch (err) {
    logger.error({ err }, "Logout action error");
    return { error: "Erreur lors de la déconnexion." };
  }
}

// ============================================
// Get current user from Supabase + Prisma
// ============================================
export async function getCurrentUserAction() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) return null;

    const user = await prisma.user.findUnique({
      where: { supabaseUserId: authUser.id },
      include: { organization: true },
    });

    return user;
  } catch {
    return null;
  }
}
