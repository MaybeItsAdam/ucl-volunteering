import { describe, expect, it } from "vitest";
import { badges, EMPTY_FILTER, fromRow, isStale, matchesFilter, parseEntry, parseSessions, sessionLabel, slugify, type DirectoryRow } from "./directory";

const valid = {
  organisation: "Crisis Skylight",
  title: "Kitchen volunteer",
  summary: "Help cook lunch for members",
  causes: ["homelessness", "food"],
  commitment: "drop_in",
  signupMethod: "just_turn_up",
  dbs: "not_needed",
  sessions: [{ weekday: 2, start: "10:00", end: "13:00" }],
  postcode: "e1 6lt",
  minAge: "18",
};

function row(over: Partial<DirectoryRow> = {}): DirectoryRow {
  const parsed = parseEntry(valid).value!;
  return { ...parsed, id: "1", slug: "s", verified_on: "2026-10-01", updated_at: "2026-10-01T00:00:00Z", ...over };
}

describe("parseEntry", () => {
  it("cleans a valid entry", () => {
    const { value } = parseEntry(valid);
    expect(value?.postcode).toBe("E1 6LT");
    expect(value?.min_age).toBe(18);
    expect(value?.sessions).toEqual([{ weekday: 2, start: "10:00", end: "13:00", where: null, note: null }]);
    expect(value?.active).toBe(true);
  });

  it("asks for what each sign-up method needs", () => {
    expect(parseEntry({ ...valid, signupMethod: "online_form" }).error).toMatch(/link/);
    expect(parseEntry({ ...valid, signupMethod: "email" }).error).toMatch(/email/);
    expect(parseEntry({ ...valid, signupMethod: "email", signupEmail: "vols@crisis.org.uk" }).error).toBeUndefined();
  });

  it("needs session times for a drop-in, and refuses nonsense", () => {
    expect(parseEntry({ ...valid, sessions: [] }).error).toMatch(/drop-in/);
    expect(parseEntry({ ...valid, causes: ["parties"] }).error).toMatch(/cause/);
    expect(parseEntry({ ...valid, postcode: "WC1" }).error).toMatch(/postcode/);
    expect(parseEntry({ ...valid, orgUrl: "javascript:alert(1)" }).error).toBeTruthy();
    expect(parseEntry({ ...valid, title: " " }).error).toMatch(/title/);
  });
});

describe("parseSessions", () => {
  it("sorts by day and time, and rejects an end before the start", () => {
    expect(parseSessions([{ weekday: 5, start: "09:00", end: "10:00" }, { weekday: 1, start: "18:00", end: "20:00" }]).value?.map(sessionLabel)).toEqual([
      "Mon 18:00–20:00",
      "Fri 09:00–10:00",
    ]);
    expect(parseSessions([{ weekday: 1, start: "18:00", end: "17:00" }]).error).toMatch(/ends before/);
    expect(parseSessions([{ weekday: 8, start: "18:00", end: "19:00" }]).error).toMatch(/day/);
  });
});

describe("slugify", () => {
  it("makes readable URL parts", () => {
    expect(slugify("Café & Co", "Kitchen volunteer")).toBe("cafe-and-co-kitchen-volunteer");
    expect(slugify("!!!")).toBe("opportunity");
  });
});

describe("reading", () => {
  it("puts the practical facts on the card", () => {
    expect(badges(fromRow(row()))).toEqual(["Drop in", "18+", "No DBS needed"]);
  });

  it("flags entries nobody has checked for six months", () => {
    expect(isStale("2026-10-01", "2026-10-29")).toBe(false);
    expect(isStale("2026-03-01", "2026-10-29")).toBe(true);
    expect(isStale(null, "2026-10-29")).toBe(true);
  });

  it("filters by day, cause, drop-in, DBS and words", () => {
    const e = fromRow(row());
    expect(matchesFilter(e, { ...EMPTY_FILTER, day: 2 })).toBe(true);
    expect(matchesFilter(e, { ...EMPTY_FILTER, day: 3 })).toBe(false);
    expect(matchesFilter(fromRow(row({ sessions: [], commitment: "flexible", signup_method: "email" })), { ...EMPTY_FILTER, day: 3 })).toBe(true);
    expect(matchesFilter(e, { ...EMPTY_FILTER, cause: "animals" })).toBe(false);
    expect(matchesFilter(e, { ...EMPTY_FILTER, dropIn: true, noDbs: true })).toBe(true);
    expect(matchesFilter(fromRow(row({ dbs: "needed" })), { ...EMPTY_FILTER, noDbs: true })).toBe(false);
    expect(matchesFilter(e, { ...EMPTY_FILTER, q: "crisis e1" })).toBe(true);
    expect(matchesFilter(e, { ...EMPTY_FILTER, q: "crisis hospital" })).toBe(false);
  });
});
