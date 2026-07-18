import { z } from "zod";

export const sendSmsBodySchema = z.object({
  connectorId: z.string().min(1, "connectorId requis"),
  to: z.string().min(3, "Num\u00e9ro requis"),
  text: z.string().min(1).max(306),
  from: z.string().optional(),
  requestDlr: z.boolean().default(true),
});

export type SendSmsBody = z.infer<typeof sendSmsBodySchema>;
