import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "crypto";

/**
 * At-rest encryption for committee members' calendar links (the UCL timetable
 * and personal Google, Outlook and iCloud feeds). Ported from
 * Adam's Campus Toolbox (`personalTimetableCrypto.ts`), under this app's own
 * key and HKDF domain.
 *
 * A UCL timetable link (`https://www.ucl.ac.uk/timetable/ics/<token>`) is a
 * bearer secret: whoever holds it reads that student's timetable, no sign-in
 * needed. The server must get it back to refresh the feed, so it cannot be
 * hashed — it is encrypted, with a key the database does not hold.
 *
 * AES-256-GCM with an HKDF-SHA256-derived key, stored as
 * `v1.<iv>.<tag>.<ct>` base64url, under `TIMETABLE_FEED_KEY`.
 *
 * Never log a decrypted link, never put one in an error, never return one
 * from a route.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

/** Fixed, and part of the format: change it and every stored link stops decrypting. */
const HKDF_INFO = "ucl-volunteering/personal-timetable-feed/v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TIMETABLE_FEED_KEY;
  if (!raw) {
    throw new Error("TIMETABLE_FEED_KEY is not set: timetable links are not configured.");
  }
  const material = Buffer.from(raw, "base64");
  if (material.length < 32) {
    throw new Error("TIMETABLE_FEED_KEY must be at least 32 bytes of base64-encoded key material.");
  }
  cachedKey = Buffer.from(
    hkdfSync("sha256", material, new Uint8Array(0), Buffer.from(HKDF_INFO), 32),
  );
  return cachedKey;
}

/** Separate from the encryption key, so a fingerprint can never help decrypt. */
const FINGERPRINT_INFO = "ucl-volunteering/calendar-link-fingerprint/v1";
let cachedFingerprintKey: Buffer | null = null;

/**
 * A keyed fingerprint of a normalised link (HMAC-SHA256 under a key derived
 * from `TIMETABLE_FEED_KEY`), stored beside it so the same calendar can't be
 * linked twice without decrypting every link. Keyed rather than a bare hash so
 * the database alone can't confirm a guessed link.
 */
export function feedUrlFingerprint(url: string): string {
  if (!cachedFingerprintKey) {
    const material = Buffer.from(process.env.TIMETABLE_FEED_KEY ?? "", "base64");
    getKey(); // the same "is it configured" checks, and errors, as encryption
    cachedFingerprintKey = Buffer.from(
      hkdfSync("sha256", material, new Uint8Array(0), Buffer.from(FINGERPRINT_INFO), 32),
    );
  }
  return createHmac("sha256", cachedFingerprintKey).update(url).digest("base64url").slice(0, 32);
}

/** Whether a link can be stored on this deployment at all. */
export function isTimetableFeedKeyConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptFeedUrl(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/**
 * Recover a link, or null. A malformed payload, a wrong key and a tampered
 * ciphertext are deliberately one answer.
 */
export function decryptFeedUrl(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
