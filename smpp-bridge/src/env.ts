import { z } from "zod";

const envSchema = z.object({
  BRIDGE_PORT: z.coerce.number().int().positive().default(3001),
  BRIDGE_API_KEY: z.string().min(1, "BRIDGE_API_KEY is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
});

export type BridgeEnv = z.infer<typeof envSchema>;

let _env: BridgeEnv | null = null;

export function loadBridgeEnv(): BridgeEnv {
  if (_env) return _env;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Bridge env invalid:\n${issues}`);
  }
  _env = parsed.data;
  return _env;
}
