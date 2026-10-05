import { describe, expect, it } from "vitest";
import { parseIcs, parseProperty, resolveTimeZone, unfold } from "./ics";

/**
 * Fixtures are shaped like the UCL SU feed this parser was written against —
 * Exchange 2010, Windows zone names, folded lines, `\;` inside LOCATION —
 * because those are the details a general iCalendar example would not have.
 */
function calendar(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "METHOD:PUBLISH",
    "PRODID:Microsoft Exchange Server 2010",
    "VERSION:2.0",
    "X-WR-CALNAME:Calendar",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

const HORIZON = new Date("2027-01-01T00:00:00Z");

describe("unfold", () => {
  it("joins a continuation and drops the folding whitespace", () => {
    expect(unfold("UID:abc\r\n def\r\nSUMMARY:x")).toEqual(["UID:abcdef", "SUMMARY:x"]);
  });

  it("accepts bare LF, which Exchange emits", () => {
    expect(unfold("A:1\nB:2")).toEqual(["A:1", "B:2"]);
  });

  it("treats a tab continuation the same as a space", () => {
    expect(unfold("UID:ab\r\n\tcd")).toEqual(["UID:abcd"]);
  });
});

describe("parseProperty", () => {
  it("splits name, params and value", () => {
    expect(parseProperty("DTSTART;TZID=GMT Standard Time:20250919T200000")).toEqual({
      name: "DTSTART",
      params: { TZID: "GMT Standard Time" },
      value: "20250919T200000",
    });
  });

  it("does not split on a colon inside a quoted parameter", () => {
    const parsed = parseProperty('DTSTART;TZID="GMT+1:00":20250919T200000');
    expect(parsed?.params.TZID).toBe("GMT+1:00");
    expect(parsed?.value).toBe("20250919T200000");
  });

  it("returns null for a line with no colon", () => {
    expect(parseProperty("BEGIN")).toBeNull();
  });
});

describe("resolveTimeZone", () => {
  it("maps the Windows name Exchange publishes", () => {
    expect(resolveTimeZone("GMT Standard Time")).toBe("Europe/London");
  });

  it("passes an IANA id straight through", () => {
    expect(resolveTimeZone("Europe/Paris")).toBe("Europe/Paris");
  });

  it("returns null for a name neither table nor Intl knows", () => {
    expect(resolveTimeZone("Middle Earth Standard Time")).toBeNull();
  });
});

describe("parseIcs", () => {
  it("reads a single timed event in a Windows zone", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:one",
          "SUMMARY:Karaoke || Mullys Bar",
          "DTSTART;TZID=GMT Standard Time:20260919T200000",
          "DTEND;TZID=GMT Standard Time:20260920T013000",
          "LOCATION:~134-136GowerSt.Lewis Basement Venue.(250).UCLU",
          "STATUS:CONFIRMED",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );

    expect(result.name).toBe("Calendar");
    expect(result.unsupported).toEqual([]);
    expect(result.events).toHaveLength(1);
    const event = result.events[0];
    expect(event.summary).toBe("Karaoke || Mullys Bar");
    // 20:00 on 19 September is BST, so the instant is 19:00Z. Getting this
    // wrong by an hour is the whole reason the Windows zone table exists.
    expect(event.start.toISOString()).toBe("2026-09-19T19:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-09-20T00:30:00.000Z");
    expect(event.allDay).toBe(false);
    expect(event.recurring).toBe(false);
    expect(event.recurrenceId).toBeNull();
  });

  it("holds a winter event at the same wall-clock time", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:winter",
          "SUMMARY:Quiz",
          "DTSTART;TZID=GMT Standard Time:20261203T200000",
          "DTEND;TZID=GMT Standard Time:20261203T220000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );
    // December is GMT, so 20:00 local is 20:00Z — the September case above is
    // the same property producing a different offset.
    expect(result.events[0].start.toISOString()).toBe("2026-12-03T20:00:00.000Z");
  });

  it("unescapes text and reads a VALUE=DATE event as all-day", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:allday",
          "SUMMARY:Reading week\\; no classes",
          "DESCRIPTION:Line one\\nLine two",
          "DTSTART;VALUE=DATE:20261109",
          "DTEND;VALUE=DATE:20261114",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );
    const event = result.events[0];
    expect(event.summary).toBe("Reading week; no classes");
    expect(event.description).toBe("Line one\nLine two");
    expect(event.allDay).toBe(true);
  });

  it("expands a weekly rule and stops at UNTIL", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:weekly",
          "SUMMARY:Karaoke",
          "RRULE:FREQ=WEEKLY;UNTIL=20261016T190000Z;INTERVAL=1;BYDAY=FR;WKST=MO",
          "DTSTART;TZID=GMT Standard Time:20260925T200000",
          "DTEND;TZID=GMT Standard Time:20260925T230000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );
    expect(result.events.map((e) => e.start.toISOString())).toEqual([
      "2026-09-25T19:00:00.000Z",
      "2026-10-02T19:00:00.000Z",
      "2026-10-09T19:00:00.000Z",
      "2026-10-16T19:00:00.000Z",
    ]);
    expect(result.events.every((e) => e.recurring)).toBe(true);
    // Every occurrence shares the UID, so `recurrenceId` is what keeps them
    // apart — the trap that would otherwise collapse a series into one row.
    expect(new Set(result.events.map((e) => e.recurrenceId)).size).toBe(4);
  });

  it("honours INTERVAL", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:fortnightly",
          "SUMMARY:Fortnightly quiz",
          "RRULE:FREQ=WEEKLY;COUNT=3;INTERVAL=2;BYDAY=TU",
          "DTSTART;TZID=GMT Standard Time:20260922T130000",
          "DTEND;TZID=GMT Standard Time:20260922T140000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );
    expect(result.events.map((e) => e.start.toISOString().slice(0, 10))).toEqual([
      "2026-09-22",
      "2026-10-06",
      "2026-10-20",
    ]);
  });

  it("drops the dates named in EXDATE", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:withex",
          "SUMMARY:Karaoke",
          "RRULE:FREQ=WEEKLY;COUNT=4;INTERVAL=1;BYDAY=FR",
          "EXDATE;TZID=GMT Standard Time:20261002T200000,20261016T200000",
          "DTSTART;TZID=GMT Standard Time:20260925T200000",
          "DTEND;TZID=GMT Standard Time:20260925T230000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );
    expect(result.events.map((e) => e.start.toISOString().slice(0, 10))).toEqual([
      "2026-09-25",
      "2026-10-09",
    ]);
  });

  it("lets a RECURRENCE-ID override replace that one occurrence", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:series",
          "SUMMARY:Karaoke",
          "RRULE:FREQ=WEEKLY;COUNT=3;INTERVAL=1;BYDAY=FR",
          "DTSTART;TZID=GMT Standard Time:20260925T200000",
          "DTEND;TZID=GMT Standard Time:20260925T230000",
          "END:VEVENT",
        ].join("\r\n"),
        [
          "BEGIN:VEVENT",
          "UID:series",
          "RECURRENCE-ID;TZID=GMT Standard Time:20261002T200000",
          "SUMMARY:Canceled: Karaoke",
          "STATUS:CANCELLED",
          "DTSTART;TZID=GMT Standard Time:20261002T200000",
          "DTEND;TZID=GMT Standard Time:20261002T230000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );
    expect(result.events).toHaveLength(3);
    const overridden = result.events[1];
    expect(overridden.summary).toBe("Canceled: Karaoke");
    expect(overridden.status).toBe("CANCELLED");
  });

  it("reports an unexpanded FREQ rather than dropping the event", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:monthly",
          "SUMMARY:Committee meeting",
          "RRULE:FREQ=MONTHLY;COUNT=6;BYMONTHDAY=1",
          "DTSTART;TZID=GMT Standard Time:20261001T180000",
          "DTEND;TZID=GMT Standard Time:20261001T190000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON },
    );
    // The first instance survives; the silence about the rest is the bug this
    // guards against, so the message must actually be there.
    expect(result.events).toHaveLength(1);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]).toContain("FREQ=MONTHLY");
  });

  it("applies the window to a plain event, not only to recurrences", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:old",
          "SUMMARY:Last year's freshers",
          "DTSTART;TZID=GMT Standard Time:20250919T200000",
          "DTEND;TZID=GMT Standard Time:20250919T230000",
          "END:VEVENT",
        ].join("\r\n"),
        [
          "BEGIN:VEVENT",
          "UID:soon",
          "SUMMARY:This year's freshers",
          "DTSTART;TZID=GMT Standard Time:20260919T200000",
          "DTEND;TZID=GMT Standard Time:20260919T230000",
          "END:VEVENT",
        ].join("\r\n"),
        [
          "BEGIN:VEVENT",
          "UID:far",
          "SUMMARY:Beyond the horizon",
          "DTSTART;TZID=GMT Standard Time:20270919T200000",
          "DTEND;TZID=GMT Standard Time:20270919T230000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: HORIZON, since: new Date("2026-09-01T00:00:00Z") },
    );
    // A published calendar keeps its history: without this the "next 180 days"
    // sync wrote a year of past events.
    expect(result.events.map((e) => e.uid)).toEqual(["soon"]);
  });

  it("stops an unbounded rule at the horizon", () => {
    const result = parseIcs(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:forever",
          "SUMMARY:Weekly forever",
          "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
          "DTSTART;TZID=GMT Standard Time:20260921T180000",
          "DTEND;TZID=GMT Standard Time:20260921T190000",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { horizon: new Date("2026-10-19T23:00:00Z") },
    );
    expect(result.events.map((e) => e.start.toISOString().slice(0, 10))).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
  });

  it("skips components that are not VEVENT", () => {
    const result = parseIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VTIMEZONE",
        "TZID:GMT Standard Time",
        "BEGIN:STANDARD",
        "DTSTART:16010101T020000",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0000",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "UID:real",
        "SUMMARY:Actual event",
        "DTSTART;TZID=GMT Standard Time:20261001T180000",
        "DTEND;TZID=GMT Standard Time:20261001T190000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      { horizon: HORIZON },
    );
    // VTIMEZONE carries a DTSTART of 1601, which is an event only if the
    // component type is ignored.
    expect(result.events.map((e) => e.uid)).toEqual(["real"]);
  });

  it("returns nothing for input that is not a calendar", () => {
    const result = parseIcs("<!DOCTYPE html><html><body>Outlook</body></html>", {
      horizon: HORIZON,
    });
    expect(result.events).toEqual([]);
  });
});
