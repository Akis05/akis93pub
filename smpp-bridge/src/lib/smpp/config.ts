import { z } from "zod";

const smppEnvSchema = z.object({
  SMPP_HOST: z.string().min(1, "SMPP_HOST est requis"),
  SMPP_PORT: z.coerce.number().int().positive(),
  SMPP_SYSTEM_ID: z.string().min(1, "SMPP_SYSTEM_ID est requis"),
  SMPP_PASSWORD: z.string().min(1, "SMPP_PASSWORD est requis"),
  SMPP_SYSTEM_TYPE: z.string().default(""),
  SMPP_SOURCE_ADDR: z.string().min(1),
  SMPP_ADDR_TON: z.coerce.number().int().default(0),
  SMPP_ADDR_NPI: z.coerce.number().int().default(1),
  SMPP_BIND_MODE: z.enum(["transceiver", "transmitter", "receiver"]).default("transceiver"),
  SMPP_ENQUIRE_LINK_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  SMPP_RECONNECT_DELAY_MS: z.coerce.number().int().positive().default(5000),
  SMPP_RECONNECT_MAX_DELAY_MS: z.coerce.number().int().positive().default(60000),
  SMPP_SUBMIT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  SMPP_USE_TLS: z.string().default("false").transform((v) => v === "true"),
  SMPP_ENABLE_QUERY_SM: z.string().default("false").transform((v) => v === "true"),
});

export type SmppConfig = z.infer<typeof smppEnvSchema> & { interfaceVersion: number };

export function loadSmppConfig(): SmppConfig {
  const parsed = smppEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration SMPP invalide:\n${issues}`);
  }
  return { ...parsed.data, interfaceVersion: 0x34 };
}
