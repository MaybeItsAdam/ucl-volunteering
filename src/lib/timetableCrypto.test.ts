import { beforeAll, describe, expect, it } from "vitest";

// Set before the dynamic import: the key is read once and cached.
process.env.TIMETABLE_FEED_KEY = Buffer.from("timetable-key-material-32-bytes!", "utf8").toString("base64");

let mod: typeof import("./timetableCrypto");
beforeAll(async () => {
  mod = await import("./timetableCrypto");
});

describe("personal timetable link encryption", () => {
  const link = "https://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB";

  it("round-trips and never stores the link in clear", () => {
    const sealed = mod.encryptFeedUrl(link);
    expect(sealed).not.toContain("PONIBF332NKJB");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(mod.decryptFeedUrl(sealed)).toBe(link);
    expect(mod.encryptFeedUrl(link)).not.toBe(sealed);
  });

  it("answers null for tampered or malformed input", () => {
    const sealed = mod.encryptFeedUrl(link);
    const parts = sealed.split(".");
    const flipped = parts[3][0] === "A" ? `B${parts[3].slice(1)}` : `A${parts[3].slice(1)}`;
    expect(mod.decryptFeedUrl([parts[0], parts[1], parts[2], flipped].join("."))).toBeNull();
    expect(mod.decryptFeedUrl("v2.a.b.c")).toBeNull();
    expect(mod.decryptFeedUrl(null)).toBeNull();
  });

  it("reports itself configured", () => {
    expect(mod.isTimetableFeedKeyConfigured()).toBe(true);
  });

  it("fingerprints a link the same way every time, without revealing it", () => {
    const url = "https://calendar.google.com/calendar/ical/sam%40gmail.com/private-0123456789abcdef/basic.ics";
    const print = mod.feedUrlFingerprint(url);
    expect(print).toBe(mod.feedUrlFingerprint(url));
    expect(print).not.toBe(mod.feedUrlFingerprint(`${url}x`));
    expect(print).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(print).not.toContain("sam");
  });
});
