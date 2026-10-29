import { describe, expect, it } from "vitest";
import { fromRow, parseEntry, type DirectoryRow } from "./directory";
import type { CommunityEvent } from "./communityEvents";
import { eventItems, groupByPlace, matchesTimetable, NO_FILTER, sessionItems, timeOfDay } from "./timetable";

const MONDAY = "2026-11-02"; // GMT, after the clocks change

function entry(over: Record<string, unknown> = {}) {
  const parsed = parseEntry({
    organisation: "Crisis Skylight",
    title: "Kitchen volunteer",
    summary: "Cook lunch",
    causes: ["homelessness"],
    commitment: "drop_in",
    signupMethod: "just_turn_up",
    dbs: "not_needed",
    sessions: [
      { weekday: 2, start: "10:00", end: "13:00" },
      { weekday: 4, start: "18:00", end: "20:00", note: "Term time only" },
    ],
    address: "66 Commercial St",
    postcode: "E1 6LT",
    ...over,
  }).value!;
  const row: DirectoryRow = { ...parsed, id: "d1", slug: "crisis-kitchen", verified_on: "2026-10-01", updated_at: "" };
  return fromRow(row);
}

const event = (over: Partial<CommunityEvent> = {}): CommunityEvent => ({
  id: "e1",
  societyId: "s1",
  title: "Litter pick",
  startsAt: "2026-11-07T10:00:00.000Z",
  endsAt: "2026-11-07T12:00:00.000Z",
  allDay: false,
  location: "Cruciform B404",
  description: null,
  url: "https://example.org/e1",
  cancelled: false,
  ...over,
});

describe("sessionItems", () => {
  it("puts each weekly session on its day of the week, at London time", () => {
    const items = sessionItems([entry()], MONDAY);
    expect(items.map((i) => [i.startsAt, i.endsAt])).toEqual([
      ["2026-11-03T10:00:00.000Z", "2026-11-03T13:00:00.000Z"],
      ["2026-11-05T18:00:00.000Z", "2026-11-05T20:00:00.000Z"],
    ]);
    expect(items[0]).toMatchObject({ kind: "session", dropIn: true, place: "66 commercial st, e1 6lt", href: "/opportunities/crisis-kitchen" });
    expect(items[1].note).toBe("Term time only");
  });

  it("follows British Summer Time", () => {
    expect(sessionItems([entry()], "2026-10-19")[0].startsAt).toBe("2026-10-20T09:00:00.000Z");
  });
});

describe("eventItems", () => {
  it("keeps events in the week and drops cancelled ones", () => {
    const items = eventItems(
      [event(), event({ id: "e2", cancelled: true }), event({ id: "e3", startsAt: "2026-11-10T10:00:00.000Z", endsAt: "2026-11-10T11:00:00.000Z" })],
      [{ id: "s1", name: "Street Aid", logoUrl: null, colour: "#ff6b2b", darkColour: null }],
      MONDAY,
    );
    expect(items.map((i) => i.id)).toEqual(["e1"]);
    expect(items[0]).toMatchObject({ host: "Street Aid", colour: "#ff6b2b", place: "cruciform b404", external: true });
  });
});

describe("matchesTimetable", () => {
  const [tuesday, thursday] = sessionItems([entry()], MONDAY);
  const [litter] = eventItems([event()], [], MONDAY);

  it("filters on kind, time of day, drop-in and words", () => {
    expect(timeOfDay(tuesday)).toBe("morning");
    expect(timeOfDay(thursday)).toBe("evening");
    expect(matchesTimetable(tuesday, { ...NO_FILTER, time: "morning" })).toBe(true);
    expect(matchesTimetable(thursday, { ...NO_FILTER, time: "morning" })).toBe(false);
    expect(matchesTimetable(litter, { ...NO_FILTER, kind: "session" })).toBe(false);
    expect(matchesTimetable(tuesday, { ...NO_FILTER, dropIn: true })).toBe(true);
    expect(matchesTimetable(litter, { ...NO_FILTER, dropIn: true })).toBe(false);
    expect(matchesTimetable(litter, { ...NO_FILTER, q: "cruciform litter" })).toBe(true);
  });

  it("leaves events out of cause and DBS filters, which only directory entries carry", () => {
    expect(matchesTimetable(tuesday, { ...NO_FILTER, cause: "homelessness", noDbs: true })).toBe(true);
    expect(matchesTimetable(litter, { ...NO_FILTER, cause: "homelessness" })).toBe(false);
    expect(matchesTimetable(litter, { ...NO_FILTER, noDbs: true })).toBe(false);
  });
});

describe("groupByPlace", () => {
  it("puts everything at one spot under one pin, and skips what has no place", () => {
    const items = [...sessionItems([entry()], MONDAY), ...eventItems([event(), event({ id: "e4", location: "Online" })], [], MONDAY)];
    const groups = groupByPlace(items, { "66 commercial st, e1 6lt": { lat: 51.5, lng: -0.07 }, "cruciform b404": { lat: 51.5242, lng: -0.135 } });
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
  });
});
