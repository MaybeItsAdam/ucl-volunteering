import { describe, expect, it } from "vitest";
import { displayAccessCode, generateAccessCode, hashAccessCode, normaliseAccessCode } from "./accessCodes";

describe("access codes", () => {
  it("generates codes it accepts back, in any case and with the dash", () => {
    const code = generateAccessCode();
    expect(code).toHaveLength(10);
    expect(normaliseAccessCode(displayAccessCode(code).toLowerCase())).toBe(code);
  });

  it("rejects the wrong length and characters that are never issued", () => {
    expect(normaliseAccessCode("ABCDE")).toBeNull();
    expect(normaliseAccessCode("0123456789")).toBeNull();
    expect(normaliseAccessCode(12)).toBeNull();
  });

  it("hashes the same code the same way", () => {
    expect(hashAccessCode("ABCDEFGHJK")).toBe(hashAccessCode("ABCDEFGHJK"));
    expect(hashAccessCode("ABCDEFGHJK")).not.toBe(hashAccessCode("ABCDEFGHJM"));
  });
});
