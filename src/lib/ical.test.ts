import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseContentLine, parseDuration, parseIcal, parseIcalDate, unescapeText, unfoldLines } from "./ical";

// Three events from the live Social Impact feed (3 Oct 2026), byte for byte.
const feed = readFileSync(new URL("./__fixtures__/organiser-feed.ics", import.meta.url), "utf8");

describe("the Toolbox organiser feed", () => {
  const events = parseIcal(feed);

  it("reads every event", () => {
    expect(events.map((e) => e.uid)).toEqual([
      "cmtyezb1100j301s6qjjmmgtd@adamscampustoolbox.org.uk",
      "cmtyezb4y00j501s6bbhtnxo8@adamscampustoolbox.org.uk",
      "cmtyeyhqy005o01s67syiyfas@adamscampustoolbox.org.uk",
    ]);
  });

  it("unfolds and unescapes text", () => {
    const fair = events[0];
    expect(fair.title).toBe("UCL East Volunteering Fair");
    expect(fair.location).toBe("Marshgate Building, UCL East Campus");
    expect(fair.url).toBe("https://studentsunionucl.org/whats-on/volunteering/ucl-east-volunteering-fair-0?v=95152");
    expect(fair.description).toContain("Book a ticket to secure your space!\nJoin us at UCL’s Volunteering Fair 2026");
    expect(fair.description).toContain("from one-off events to long-term placements");
    expect(fair.description?.endsWith("Organised by UCL Student Social Impact.")).toBe(true);
    expect(events[2].description).toContain("🎨 What You’ll Be Creating");
  });

  it("reads UTC times", () => {
    expect(events[0].start.toISOString()).toBe("2026-10-20T10:00:00.000Z");
    expect(events[0].end?.toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(events[0].allDay).toBe(false);
    expect(events[0].cancelled).toBe(false);
  });
});

describe("lines", () => {
  it("unfolds CRLF and LF folds with a space or tab", () => {
    expect(unfoldLines("A:one\r\n two\r\nB:x\n\tyz\nC:z")).toEqual(["A:onetwo", "B:xyz", "C:z"]);
  });

  it("unescapes", () => {
    expect(unescapeText("a\\, b\\; c\\\\d\\nE\\Nf")).toBe("a, b; c\\d\nE\nf");
  });

  it("splits parameters, quoted colons included", () => {
    expect(parseContentLine('DTSTART;TZID="Europe/London":20261020T180000')).toEqual({
      name: "DTSTART",
      params: { TZID: "Europe/London" },
      value: "20261020T180000",
    });
    expect(parseContentLine('LOCATION;ALTREP="http://x/y":Room 1')?.value).toBe("Room 1");
    expect(parseContentLine("no colon")).toBeNull();
  });
});

describe("dates", () => {
  it("reads TZID=Europe/London either side of the clock change", () => {
    expect(parseIcalDate("20261024T180000", { TZID: "Europe/London" })?.date.toISOString()).toBe("2026-10-24T17:00:00.000Z");
    expect(parseIcalDate("20261026T180000", { TZID: "Europe/London" })?.date.toISOString()).toBe("2026-10-26T18:00:00.000Z");
  });

  it("treats floating times as London and an unknown zone as London too", () => {
    expect(parseIcalDate("20260701T090000")?.date.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(parseIcalDate("20260701T090000", { TZID: "Not/AZone" })?.date.toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });

  it("reads other zones", () => {
    expect(parseIcalDate("20260115T090000", { TZID: "America/New_York" })?.date.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("reads all-day dates as London midnight", () => {
    expect(parseIcalDate("20261020", { VALUE: "DATE" })).toEqual({ date: new Date("2026-10-19T23:00:00Z"), allDay: true });
    expect(parseIcalDate("20261201")).toEqual({ date: new Date("2026-12-01T00:00:00Z"), allDay: true });
  });

  it("rejects junk", () => {
    expect(parseIcalDate("2026-10-20")).toBeNull();
    expect(parseIcalDate("20261320T100000Z")).toBeNull();
  });

  it("reads durations", () => {
    expect(parseDuration("PT1H30M")).toBe(90 * 60_000);
    expect(parseDuration("P1D")).toBe(86_400_000);
    expect(parseDuration("P1W")).toBe(7 * 86_400_000);
    expect(parseDuration("-PT15M")).toBe(-15 * 60_000);
    expect(parseDuration("P")).toBeNull();
    expect(parseDuration("PT")).toBeNull();
    expect(parseDuration("1H")).toBeNull();
  });
});

describe("events", () => {
  const cal = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;

  it("handles all-day, duration, cancelled, alarms and broken events", () => {
    const events = parseIcal(
      cal(
        [
          "BEGIN:VEVENT",
          "UID:allday",
          "DTSTART;VALUE=DATE:20261020",
          "DTEND;VALUE=DATE:20261022",
          "SUMMARY:Two days",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:noend",
          "DTSTART;VALUE=DATE:20261101",
          "SUMMARY:One day",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:dur",
          "DTSTART;TZID=Europe/London:20261025T013000",
          "DURATION:PT2H",
          "SUMMARY:Over the change",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:Not the event's",
          "END:VALARM",
          "STATUS:CANCELLED",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "SUMMARY:No uid",
          "DTSTART:20261020T100000Z",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:nostart",
          "DTSTART:garbage",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:backwards",
          "DTSTART:20261020T100000Z",
          "DTEND:20261020T090000Z",
          "LOCATION:",
          "END:VEVENT",
          "",
        ].join("\r\n"),
      ),
    );

    expect(events.map((e) => e.uid)).toEqual(["allday", "noend", "dur", "backwards"]);
    const [twoDays, oneDay, dur, backwards] = events;
    expect(twoDays.allDay).toBe(true);
    expect(twoDays.start.toISOString()).toBe("2026-10-19T23:00:00.000Z");
    expect(twoDays.end?.toISOString()).toBe("2026-10-21T23:00:00.000Z");
    expect(oneDay.end?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(dur.start.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(dur.end?.toISOString()).toBe("2026-10-25T02:30:00.000Z");
    expect(dur.cancelled).toBe(true);
    expect(dur.description).toBeNull();
    expect(backwards.end).toBeNull();
    expect(backwards.location).toBeNull();
    expect(backwards.title).toBe("");
  });

  it("returns nothing for an empty or non-calendar body", () => {
    expect(parseIcal("")).toEqual([]);
    expect(parseIcal("<html>Bad gateway</html>")).toEqual([]);
  });
});
