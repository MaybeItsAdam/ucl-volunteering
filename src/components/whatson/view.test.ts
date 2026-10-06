import { describe, expect, it } from "vitest";
import {
  filterEvents,
  groupByDay,
  parseRange,
  parseSocieties,
  rangeEnd,
  societyLabel,
  toggleSociety,
  whatsOnHref,
} from "./view";

// Tuesday 6 October 2026, 13:00 in London.
const NOW = new Date("2026-10-06T12:00:00Z");
const KNOWN = ["a", "b", "c"];

function event(id: string, societyId: string, startsAt: string, hours = 1) {
  return { id, societyId, startsAt, endsAt: new Date(Date.parse(startsAt) + hours * 3_600_000).toISOString() };
}

const EVENTS = [
  event("running", "a", "2026-10-05T22:00:00Z", 16), // since 23:00 yesterday, until 14:00 today
  event("over", "a", "2026-10-06T08:00:00Z"), // ended this morning
  event("tonight", "b", "2026-10-06T18:00:00Z"),
  event("tomorrow", "c", "2026-10-07T09:00:00Z"),
  event("sunday", "a", "2026-10-11T12:00:00Z"),
  event("monday", "b", "2026-10-12T12:00:00Z"),
  event("november", "a", "2026-11-20T12:00:00Z"),
];

describe("URL state", () => {
  it("reads the range, defaulting to the next 30 days", () => {
    expect(parseRange("week")).toBe("week");
    expect(parseRange("all")).toBe("all");
    expect(parseRange(undefined)).toBe("month");
    expect(parseRange("forever")).toBe("month");
  });

  it("reads societies it knows, in the known order", () => {
    expect(parseSocieties("c,a,zzz", KNOWN)).toEqual(["a", "c"]);
    expect(parseSocieties(undefined, KNOWN)).toEqual([]);
  });

  it("toggles a society and builds the link, leaving defaults out", () => {
    expect(toggleSociety(["a"], "c", KNOWN)).toEqual(["a", "c"]);
    expect(toggleSociety(["a", "c"], "a", KNOWN)).toEqual(["c"]);
    expect(whatsOnHref("month", [])).toBe("/portal/whats-on");
    expect(whatsOnHref("week", ["a", "c"])).toBe("/portal/whats-on?range=week&s=a%2Cc");
  });
});

describe("ranges", () => {
  it("ends this week at Monday midnight, and 30 days at the start of the 31st day", () => {
    expect(rangeEnd("week", NOW)?.toISOString()).toBe("2026-10-11T23:00:00.000Z");
    expect(rangeEnd("month", NOW)?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(rangeEnd("all", NOW)).toBeNull();
  });

  it("drops what has ended, and keeps what is still running", () => {
    expect(filterEvents(EVENTS, "week", [], NOW).map((e) => e.id)).toEqual(["running", "tonight", "tomorrow", "sunday"]);
    expect(filterEvents(EVENTS, "all", [], NOW)).toHaveLength(6);
  });

  it("filters by society, all of them when none is chosen", () => {
    expect(filterEvents(EVENTS, "all", ["b"], NOW).map((e) => e.id)).toEqual(["tonight", "monday"]);
  });
});

describe("groupByDay", () => {
  it("groups by London day, with a running event under today", () => {
    const groups = groupByDay(filterEvents(EVENTS, "month", [], NOW), NOW);
    expect(groups.map((g) => [g.heading, g.events.map((e) => e.id)])).toEqual([
      ["Today", ["running", "tonight"]],
      ["Tomorrow", ["tomorrow"]],
      ["Sun 11 Oct", ["sunday"]],
      ["Mon 12 Oct", ["monday"]],
    ]);
  });
});

describe("societyLabel", () => {
  it("drops the trailing Society, but not from VolSoc", () => {
    expect(societyLabel("Street Aid Society", "x")).toBe("Street Aid");
    expect(societyLabel("UCL Student Social Impact", "x")).toBe("UCL Student Social Impact");
    expect(societyLabel("Volunteering Society", "org_soc_vol_fix")).toBe("UCL Volunteering Society");
  });
});
