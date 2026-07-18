import { describe, it, expect } from "vitest";
import { normalizePhone, sendSmsSchema } from "../validations";

describe("normalizePhone", () => {
  it("adds a leading + when missing", () => {
    expect(normalizePhone("33612345678")).toBe("+33612345678");
  });

  it("strips spaces, dashes, dots and parentheses", () => {
    expect(normalizePhone("+33 6-12.34(56)78")).toBe("+33612345678");
  });

  it("leaves an already-normalized number unchanged", () => {
    expect(normalizePhone("+33612345678")).toBe("+33612345678");
  });
});

describe("sendSmsSchema", () => {
  it("accepts a valid E.164 destination without a leading +", () => {
    const parsed = sendSmsSchema.safeParse({ to: "33612345678", text: "hello" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.to).toBe("+33612345678");
  });

  it("rejects a destination that is too short", () => {
    const parsed = sendSmsSchema.safeParse({ to: "+331", text: "hello" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty message body", () => {
    const parsed = sendSmsSchema.safeParse({ to: "+33612345678", text: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a message longer than 306 characters", () => {
    const parsed = sendSmsSchema.safeParse({ to: "+33612345678", text: "a".repeat(307) });
    expect(parsed.success).toBe(false);
  });
});
