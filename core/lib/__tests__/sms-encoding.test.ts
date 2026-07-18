import { describe, it, expect } from "vitest";
import { requiresUnicode, computeSegments } from "../sms-encoding";

describe("requiresUnicode", () => {
  it("returns false for plain GSM-7 text", () => {
    expect(requiresUnicode("Hello world 123!")).toBe(false);
  });

  it("returns true for text containing non-GSM-7 characters (e.g. emoji)", () => {
    expect(requiresUnicode("Hello 😀")).toBe(true);
  });

  it("returns false for GSM-7 extended/accented characters", () => {
    expect(requiresUnicode("café à Paris")).toBe(false);
  });
});

describe("computeSegments", () => {
  it("returns 1 segment for short GSM-7 text (<=160 chars)", () => {
    expect(computeSegments("a".repeat(160), false)).toBe(1);
  });

  it("returns 2 segments for GSM-7 text just over 160 chars", () => {
    expect(computeSegments("a".repeat(161), false)).toBe(2);
  });

  it("returns 1 segment for short UCS-2 text (<=70 chars)", () => {
    // Use a single UTF-16 code unit per character (unlike surrogate-pair emoji)
    // so string length matches character count.
    expect(computeSegments("中".repeat(70), true)).toBe(1);
  });

  it("returns 2 segments for UCS-2 text just over 70 chars", () => {
    expect(computeSegments("a".repeat(71), true)).toBe(2);
  });

  it("splits long GSM-7 text into 153-char concatenated segments", () => {
    expect(computeSegments("a".repeat(153 * 3), false)).toBe(3);
  });
});
