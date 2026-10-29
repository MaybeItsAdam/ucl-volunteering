import { createHash, randomInt } from "node:crypto";

/** CH&Co staff access codes (see staff.ts). Server only: this is the part that needs node:crypto. */

// Access codes. No 0/O/1/I/L, so one read out over the phone survives.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

/** A new code, shown to the principal once: ten characters, ~49 bits. */
export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** What's typed or pasted, back to the code's characters, or null if it can't be one. */
export function normaliseAccessCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

/** Codes are random, not chosen, so a plain hash is enough to keep them unreadable. */
export const hashAccessCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** XXXXX-XXXXX, for reading aloud and typing. */
export const displayAccessCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;
