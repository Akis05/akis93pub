import { z } from "zod";

/** Normalise un numéro : ajoute '+' si absent, retire espaces/tirets. */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export const sendSmsSchema = z.object({
  to: z
    .string()
    .transform((v) => normalizePhone(v))
    .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, "Numéro invalide (ex: +33612345678 ou 33612345678)")),
  text: z.string().min(1, "Message is required").max(306, "Message too long (max 306 chars / 2 segments)"),
  from: z.string().optional(),
});

export const bulkSmsSchema = z.object({
  recipients: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number")).min(1, "At least one recipient required"),
  text: z.string().min(1, "Message is required").max(306),
  from: z.string().optional(),
});

export const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number (E.164 format)"),
  groupIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const contactGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().default(""),
  color: z.string().default("#6366f1"),
});

export const campaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  message: z.string().min(1, "Message is required").max(306),
  senderName: z.string().min(1, "Sender name is required"),
  connectorId: z.string().min(1, "Connector is required"),
  targetGroupIds: z.array(z.string()).default([]),
  targetContactIds: z.array(z.string()).default([]),
});

export type SendSmsInput = z.infer<typeof sendSmsSchema>;
export type BulkSmsInput = z.infer<typeof bulkSmsSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type ContactGroupInput = z.infer<typeof contactGroupSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
