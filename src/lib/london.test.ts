import { describe, expect, it } from "vitest";
import { fromRow, parseEntry, type DirectoryRow } from "./directory";
import type { CommunityEvent } from "./communityEvents";
import { groupByPoint, matchesLondon, NO_LONDON_FILTER, placeItems, placeWhen, upcomingEvents } from "./london";

const NOW = new Date("2026-11-02T09:00:00Z");

function entry(over: Record<string, unknown> = {}) {
  const parsed = parseEntry({
    organisation: "Crisis Skylight",
    title: "Kitchen volunteer",
    summary: "Cook lunch",
    causes: ["homelessness"],
    commitment: "drop_in",
    signupMethod: "just_turn_up",
    dbs: "not_needed",
    sessions: [{ weekday: 2, start: "10:00", end: "13:00" }],
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
  startsAt: "2026-11-07T10:00:00.000Z", // a Saturday
  endsAt: "2026-11-07T12:00:00.000Z",
  allDay: false,
  location: "Cruciform B404",
  description: null,
  url: "https://example.org/e1",
  cancelled: false,
  ...over,
});

const SOCIETIES = [{ id: "s1", name: "Green Society", logoUrl: null, colour: "#4cc38e", darkColour: null }];

describe("placeItems", () => {
  it("pins a place at its address, else its first session's", () => {
    const [a] = placeItems([entry()]);
    expect(a).toMatchObject({ kind: "place", id: "place:d1", host: "Crisis Skylight", location: "66 Commercial St, E1 6LT", href: "/opportunities/crisis-kitchen" });
    expect(a.place).toBe("66 commercial st, e1 6lt");
    const [b] = placeItems([entry({ address: null, postcode: null, sessions: [{ weekday: 3, start: "09:00", end: "11:00", where: "Hackney City Farm" }] })]);
    expect(b.location).toBe("Hackney City Farm");
  });
});

describe("upcomingEvents", () => {
  it("keeps the next four weeks, soonest first, without cancelled or finished ones", () => {
    const items = upcomingEvents(
      [
        event({ id: "late", startsAt: "2026-11-20T10:00:00Z", endsAt: "2026-11-20T11:00:00Z" }),
        event({ id: "soon" }),
        event({ id: "gone", startsAt: "2026-11-01T10:00:00Z", endsAt: "2026-11-01T11:00:00Z" }),
        event({ id: "off", cancelled: true }),
        event({ id: "far", startsAt: "2027-01-10T10:00:00Z", endsAt: "2027-01-10T11:00:00Z" }),
      ],
      SOCIETIES,
      NOW,
    );
    expect(items.map((i) => i.id)).toEqual(["event:soon", "event:late"]);
    expect(items[0]).toMatchObject({ host: "Green Society", external: true, place: "cruciform b404" });
  });
});

describe("matchesLondon", () => {
  const [place] = placeItems([entry()]);
  const [ev] = upcomingEvents([event()], SOCIETIES, NOW);

  it("searches both kinds", () => {
    expect(matchesLondon(place, { ...NO_LONDON_FILTER, q: "skylight" })).toBe(true);
    expect(matchesLondon(ev, { ...NO_LONDON_FILTER, q: "green" })).toBe(true);
    expect(matchesLondon(ev, { ...NO_LONDON_FILTER, q: "skylight" })).toBe(false);
  });

  it("leaves events out of filters only places can answer", () => {
    expect(matchesLondon(ev, { ...NO_LONDON_FILTER, noDbs: true })).toBe(false);
    expect(matchesLondon(place, { ...NO_LONDON_FILTER, noDbs: true })).toBe(true);
  });

  it("keeps events on the weekday you're free", () => {
    expect(matchesLondon(ev, { ...NO_LONDON_FILTER, day: 6 })).toBe(true);
    expect(matchesLondon(ev, { ...NO_LONDON_FILTER, day: 2 })).toBe(false);
    expect(matchesLondon(place, { ...NO_LONDON_FILTER, day: 2 })).toBe(true);
  });

  it("filters by kind", () => {
    expect(matchesLondon(place, { ...NO_LONDON_FILTER, kind: "event" })).toBe(false);
    expect(matchesLondon(ev, { ...NO_LONDON_FILTER, kind: "event" })).toBe(true);
  });
});

describe("groupByPoint", () => {
  it("shares a pin between texts at one spot and skips the unplaced", () => {
    const groups = groupByPoint(
      [{ place: "a" }, { place: "b" }, { place: "c" }, { place: null }],
      { a: { lat: 51.52461, lng: -0.134 }, b: { lat: 51.52459, lng: -0.13401 }, c: { lat: 51.5, lng: -0.1 } },
    );
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
  });
});

it("placeWhen lists sessions or says nothing", () => {
  expect(placeWhen(entry())).toBe("Tue 10:00–13:00");
  expect(placeWhen(entry({ sessions: [] }))).toBeNull();
});
