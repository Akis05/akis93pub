import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { logger } from "@/core/lib/logger";

const ALG = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const VERSION = "v1";
const DEFAULT_SALT = "sms-gateway-pro-salt";

let warned = false;
// scrypt is intentionally CPU-expensive; the passphrase/salt are fixed for
// the lifetime of the process (sourced from env vars), so derive the key
// once and cache it instead of blocking the event loop on every
// encrypt/decrypt call.
let cachedKey: Buffer | null = null;
let cachedForPassphrase: string | undefined;

function deriveKey(): Buffer {
  const passphrase = process.env.SECRETS_ENCRYPTION_KEY;
  if (!passphrase) {
    // We log once and let the caller decide. In dev / first-boot we accept a
    // missing key and fall back to plain text storage.
    if (!warned) {
      logger.warn("SECRETS_ENCRYPTION_KEY missing \u2014 secrets stored in clear (DEV ONLY)");
      warned = true;
    }
    return Buffer.alloc(0);
  }
  if (passphrase.length < 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY must be at least 32 characters long");
  }
  if (cachedKey && cachedForPassphrase === passphrase) return cachedKey;
  const salt = process.env.SECRETS_ENCRYPTION_SALT || DEFAULT_SALT;
  cachedKey = scryptSync(passphrase, salt, KEY_LEN);
  cachedForPassphrase = passphrase;
  return cachedKey;
}

/**
 * Encrypts a UTF-8 string using AES-256-GCM. Returns a self-describing string
 * "v1:<iv-hex>:<authTag-hex>:<cipher-hex>". If no encryption key is configured
 * the plain value is returned unchanged (so dev environments keep working).
 */
export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  const key = deriveKey();
  if (key.length === 0) return plain;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/**
 * Decrypts a value produced by encryptSecret(). If the input does not start
 * with "v1:" we assume it is plain text (forward compatibility with older
 * rows that pre-date the encryption helper).
 */
export function decryptSecret(value: string): string {
  if (!value || !value.startsWith(`${VERSION}:`)) return value;
  const parts = value.split(":");
  if (parts.length !== 4) {
    logger.warn("decryptSecret: malformed payload, returning as-is");
    return value;
  }
  const key = deriveKey();
  if (key.length === 0) {
    logger.error("decryptSecret called without SECRETS_ENCRYPTION_KEY");
    return value;
  }
  // parts.length === 4 was just checked above, so these are all defined.
  const [, ivHex, tagHex, cipherHex] = parts as [string, string, string, string];
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Returns true if the value is already encrypted with this scheme. */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}
