import { describe, expect, it } from "vitest";
import type { CommunityEvent, CommunitySociety } from "./communityEvents";
import { parseIcal } from "./ical";
import { buildPublicCalendar } from "./publicCalendar";

const societies: CommunitySociety[] = [
  { id: "org_soc_ugegx4yxz", name: "Street Aid Society", logoUrl: null, colour: null, darkColour: null },
];
const event = (over: Partial<CommunityEvent> = {}): CommunityEvent => ({
  id: "11111111-1111-4111-8111-111111111111",
  societyId: "org_soc_ugegx4yxz",
  title: "Hot drink handout; taster",
  startsAt: "2026-10-12T17:00:00.000Z",
  endsAt: "2026-10-12T18:30:00.000Z",
  allDay: false,
  location: "132 Foster Court",
  description: null,
  url: "https://example.org/e/1",
  cancelled: false,
  ...over,
});

describe("public calendar feed", () => {
  it("round-trips through the reader, saying whose each event is", () => {
    const body = buildPublicCalendar(societies, [event(), event({ id: "2", cancelled: true })], new Date("2026-10-08T12:00:00Z"));
    expect(body).toContain("X-WR-CALNAME:Volunteering at UCL");
    const [first, second] = parseIcal(body);
    expect(first).toMatchObject({ title: "Hot drink handout; taster", location: "132 Foster Court", url: "https://example.org/e/1" });
    expect(first.start.toISOString()).toBe("2026-10-12T17:00:00.000Z");
    expect(first.description).toContain("Run by Street Aid Society");
    expect(second.cancelled).toBe(true);
  });

  it("writes an all-day event on its London date, not the UTC one", () => {
    const body = buildPublicCalendar(societies, [
      event({ allDay: true, startsAt: "2026-10-11T23:00:00.000Z", endsAt: "2026-10-12T23:00:00.000Z" }),
    ]);
    expect(body).toContain("DTSTART;VALUE=DATE:20261012");
    expect(body).toContain("DTEND;VALUE=DATE:20261013");
  });
});
