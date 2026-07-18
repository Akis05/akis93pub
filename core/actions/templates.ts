"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/lib/prisma";
import { logger } from "@/core/lib/logger";
import { createSupabaseServerClient } from "@/core/lib/supabase/server";
import type { TemplateCategory } from "@/app/generated/prisma/client";

async function getOrganizationId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;
    const user = await prisma.user.findUnique({
      where: { supabaseUserId: authUser.id },
      select: { organizationId: true },
    });
    return user?.organizationId ?? null;
  } catch { return null; }
}

export interface TemplateFormInput {
  name: string;
  content: string;
  category?: TemplateCategory;
  isActive?: boolean;
}

// Extract {{var}} variables from a template body
function extractVariables(content: string): string[] {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) set.add(m[1]!);
  return Array.from(set);
}

// ============================================
// List templates
// ============================================
export async function listTemplatesAction() {
  try {
    const organizationId = await getOrganizationId();
    if (!organizationId) return { success: false, data: [], error: "Non authentifi\u00e9." };

    const templates = await prisma.smsTemplate.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: templates };
  } catch (err) {
    logger.error({ err }, "Failed to list templates");
    return { success: false, data: [], error: "Erreur." };
  }
}

// ============================================
// Create template
// ============================================
export async function createTemplateAction(input: TemplateFormInput) {
  try {
    const organizationId = await getOrganizationId();
    if (!organizationId) return { success: false, error: "Non authentifi\u00e9." };

    if (!input.name?.trim()) return { success: false, error: "Le nom est requis." };
    if (!input.content?.trim()) return { success: false, error: "Le contenu est requis." };

    const existing = await prisma.smsTemplate.findFirst({
      where: { organizationId, name: input.name, deletedAt: null },
    });
    if (existing) return { success: false, error: "Un template portant ce nom existe d\u00e9j\u00e0." };

    const template = await prisma.smsTemplate.create({
      data: {
        name: input.name.trim(),
        content: input.content,
        variables: extractVariables(input.content),
        category: input.category ?? "TRANSACTIONAL",
        isActive: input.isActive ?? true,
        organizationId,
      },
    });

    logger.info({ templateId: template.id }, "Template created");
    revalidatePath("/sms/templates");
    return { success: true, data: template };
  } catch (err) {
    logger.error({ err }, "Failed to create template");
    return { success: false, error: "Erreur lors de la cr\u00e9ation." };
  }
}

// ============================================
// Update template
// ============================================
export async function updateTemplateAction(id: string, input: TemplateFormInput) {
  try {
    const template = await prisma.smsTemplate.update({
      where: { id },
      data: {
        name: input.name.trim(),
        content: input.content,
        variables: extractVariables(input.content),
        category: input.category ?? "TRANSACTIONAL",
        isActive: input.isActive ?? true,
      },
    });
    revalidatePath("/sms/templates");
    return { success: true, data: template };
  } catch (err) {
    logger.error({ err }, "Failed to update template");
    return { success: false, error: "Erreur." };
  }
}

// ============================================
// Delete template (soft)
// ============================================
export async function deleteTemplateAction(id: string) {
  try {
    await prisma.smsTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    revalidatePath("/sms/templates");
    return { success: true };
  } catch (err) {
    logger.error({ err }, "Failed to delete template");
    return { success: false, error: "Erreur." };
  }
}
