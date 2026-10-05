import { describe, expect, it } from "vitest";
import { parseIcal } from "./ical";
import type { PlanEvent } from "./types";
import { buildCalendar, escapeText, feedTokenMatches, foldLine, volsocFeedUrl } from "./calendarFeed";

function event(extra: Partial<PlanEvent> = {}): PlanEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    source: "volsoc",
    category: "volunteering",
    title: "Litter pick, Regent's Canal",
    startsAt: "2026-10-10T09:00:00.000Z",
    endsAt: "2026-10-10T11:00:00.000Z",
    allDay: false,
    location: "King's Cross; by the lock",
    description: "Bring gloves\nWe meet at 10",
    url: null,
    status: "confirmed",
    ...extra,
  } as PlanEvent;
}

const page = (id: string) => `https://uclvolunteering.org/portal/calendar/events/${id}`;

describe("calendar feed", () => {
  it("escapes text", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    for (const part of folded.split("\r\n")) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });

  it("round-trips through the app's own iCal parser", () => {
    const body = buildCalendar([event(), event({ id: "22222222-2222-4222-8222-222222222222", status: "cancelled" })], page);
    const parsed = parseIcal(body);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ title: "Litter pick, Regent's Canal", location: "King's Cross; by the lock", cancelled: false });
    expect(parsed[0].start.toISOString()).toBe("2026-10-10T09:00:00.000Z");
    expect(parsed[0].description).toContain("Bring gloves\nWe meet at 10");
    expect(parsed[1].cancelled).toBe(true);
  });

  it("marks provisional events tentative and writes all-day ones as dates", () => {
    const body = buildCalendar([event({ status: "provisional", allDay: true, endsAt: "2026-10-11T00:00:00.000Z" })], page);
    expect(body).toContain("STATUS:TENTATIVE");
    expect(body).toContain("DTSTART;VALUE=DATE:20261010");
    expect(body).toContain("DTEND;VALUE=DATE:20261011");
  });

  it("only opens to the configured token", () => {
    expect(feedTokenMatches("abc", "abc")).toBe(true);
    expect(feedTokenMatches("abd", "abc")).toBe(false);
    expect(feedTokenMatches("abc", undefined)).toBe(false);
  });

  it("has no URL without a token", () => {
    expect(volsocFeedUrl("https://uclvolunteering.org/", "t0k")).toBe("https://uclvolunteering.org/api/calendar/volsoc/t0k");
    expect(volsocFeedUrl("https://uclvolunteering.org", "")).toBeNull();
  });
});
