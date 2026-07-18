import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.SECRETS_ENCRYPTION_KEY;

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "a".repeat(32);
  });

  afterEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("round-trips a plaintext value", async () => {
    const { encryptSecret, decryptSecret } = await import("../aes");
    const encrypted = encryptSecret("super-secret-value");
    expect(encrypted).not.toBe("super-secret-value");
    expect(decryptSecret(encrypted)).toBe("super-secret-value");
  });

  it("produces a self-describing v1:<iv>:<tag>:<cipher> payload", async () => {
    const { encryptSecret, isEncrypted } = await import("../aes");
    const encrypted = encryptSecret("hello");
    expect(encrypted.split(":")).toHaveLength(4);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("passes an empty string through unchanged", async () => {
    const { encryptSecret } = await import("../aes");
    expect(encryptSecret("")).toBe("");
  });

  it("treats a non-versioned value as already-plaintext (forward compatibility)", async () => {
    const { decryptSecret } = await import("../aes");
    expect(decryptSecret("plain-legacy-value")).toBe("plain-legacy-value");
  });

  it("throws when the encryption key is shorter than 32 chars", async () => {
    process.env.SECRETS_ENCRYPTION_KEY = "too-short";
    const { encryptSecret } = await import("../aes");
    expect(() => encryptSecret("x")).toThrow(/at least 32 characters/);
  });
});
