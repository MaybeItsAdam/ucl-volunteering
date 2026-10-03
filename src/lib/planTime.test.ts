import { describe, expect, it } from "vitest";
import {
  addLondonDays,
  daysBetween,
  formatMinute,
  isDayKey,
  isoWeekday,
  londonDateAt,
  londonDayKey,
  londonMinuteOfDay,
  londonTime,
  londonWeek,
  mondayOf,
  shiftDayKey,
  snapDate,
  snapMinute,
  termWeek,
  wallTimeToDate,
  zoneOffsetMinutes,
} from "./planTime";

const iso = (d: Date) => d.toISOString();

describe("wall time", () => {
  it("reads BST and GMT offsets", () => {
    expect(zoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"))).toBe(60);
    expect(zoneOffsetMinutes(new Date("2026-12-01T12:00:00Z"))).toBe(0);
    expect(zoneOffsetMinutes(new Date("2026-10-25T00:59:59.999Z"))).toBe(60);
    expect(zoneOffsetMinutes(new Date("2026-10-25T01:00:00Z"))).toBe(0);
  });

  it("turns London wall time into UTC either side of the October change", () => {
    expect(iso(wallTimeToDate({ year: 2026, month: 10, day: 24, hour: 18 }))).toBe("2026-10-24T17:00:00.000Z");
    expect(iso(wallTimeToDate({ year: 2026, month: 10, day: 25, hour: 18 }))).toBe("2026-10-25T18:00:00.000Z");
  });

  it("takes the first of a repeated hour when the clocks go back", () => {
    // 01:30 happens at 00:30Z (BST) and again at 01:30Z (GMT).
    expect(iso(wallTimeToDate({ year: 2026, month: 10, day: 25, hour: 1, minute: 30 }))).toBe("2026-10-25T00:30:00.000Z");
  });

  it("pushes a skipped time forward when the clocks go forward", () => {
    // 29 Mar 2026: 01:00 GMT jumps to 02:00 BST, so 01:30 never happens.
    expect(iso(wallTimeToDate({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 }))).toBe("2026-03-29T01:30:00.000Z");
    expect(iso(wallTimeToDate({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }))).toBe("2026-03-29T01:30:00.000Z");
    expect(iso(wallTimeToDate({ year: 2026, month: 3, day: 29, hour: 0, minute: 30 }))).toBe("2026-03-29T00:30:00.000Z");
  });

  it("handles other zones", () => {
    expect(iso(wallTimeToDate({ year: 2026, month: 1, day: 15, hour: 9 }, "America/New_York"))).toBe("2026-01-15T14:00:00.000Z");
  });
});

describe("day keys", () => {
  it("names the London day, not the UTC one", () => {
    expect(londonDayKey(new Date("2026-10-03T23:30:00Z"))).toBe("2026-10-04");
    expect(londonDayKey(new Date("2026-12-03T23:30:00Z"))).toBe("2026-12-03");
  });

  it("does day arithmetic", () => {
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-19", "2026-10-26")).toBe(7);
    expect(isoWeekday("2026-10-05")).toBe(1);
    expect(isoWeekday("2026-10-04")).toBe(7);
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
  });

  it("validates", () => {
    expect(isDayKey("2026-10-03")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-1-3")).toBe(false);
    expect(isDayKey(3)).toBe(false);
  });
});

describe("minutes of the day", () => {
  it("round-trips across the October change", () => {
    for (const key of ["2026-10-24", "2026-10-25", "2026-10-26"]) {
      for (const minute of [0, 9 * 60, 18 * 60 + 15, 23 * 60 + 45]) {
        expect(londonMinuteOfDay(londonDateAt(key, minute))).toBe(minute);
        expect(londonDayKey(londonDateAt(key, minute))).toBe(key);
      }
    }
  });

  it("is clock time, so the long day has 25 hours of instants but a normal clock", () => {
    const midnight = londonDateAt("2026-10-25", 0);
    const nextMidnight = londonDateAt("2026-10-26", 0);
    expect(nextMidnight.getTime() - midnight.getTime()).toBe(25 * 3_600_000);
    expect(iso(londonDateAt("2026-10-25", 9 * 60))).toBe("2026-10-25T09:00:00.000Z");
    expect(iso(londonDateAt("2026-10-24", 9 * 60))).toBe("2026-10-24T08:00:00.000Z");
  });

  it("rolls past midnight into the next day", () => {
    expect(iso(londonDateAt("2026-10-24", 24 * 60 + 3 * 60))).toBe("2026-10-25T03:00:00.000Z");
  });

  it("formats", () => {
    expect(formatMinute(545)).toBe("09:05");
    expect(formatMinute(1440)).toBe("00:00");
    expect(londonTime(new Date("2026-10-20T10:00:00Z"))).toBe("11:00");
  });

  it("snaps to 15 minutes", () => {
    expect(snapMinute(7)).toBe(0);
    expect(snapMinute(8)).toBe(15);
    expect(snapMinute(7.5)).toBe(15);
    expect(snapMinute(1439)).toBe(1440);
    expect(snapMinute(100, 30)).toBe(90);
    expect(iso(snapDate(new Date("2026-10-20T10:07:29Z")))).toBe("2026-10-20T10:00:00.000Z");
    expect(iso(snapDate(new Date("2026-10-20T10:07:31Z")))).toBe("2026-10-20T10:15:00.000Z");
  });
});

describe("weeks", () => {
  it("starts on Monday at London midnight", () => {
    const week = londonWeek(new Date("2026-10-03T12:00:00Z"));
    expect(week.monday).toBe("2026-09-28");
    expect(iso(week.start)).toBe("2026-09-27T23:00:00.000Z");
    expect(iso(week.end)).toBe("2026-10-04T23:00:00.000Z");
    expect(week.days).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
  });

  it("puts Sunday night in the week it ends", () => {
    // 23:30 BST on Sunday 4 Oct is 22:30Z.
    expect(londonWeek(new Date("2026-10-04T22:30:00Z")).monday).toBe("2026-09-28");
    expect(londonWeek(new Date("2026-10-04T23:00:00Z")).monday).toBe("2026-10-05");
  });

  it("spans the clock change with a 169-hour week", () => {
    const week = londonWeek("2026-10-21");
    expect(iso(week.start)).toBe("2026-10-18T23:00:00.000Z");
    expect(iso(week.end)).toBe("2026-10-26T00:00:00.000Z");
    expect(week.end.getTime() - week.start.getTime()).toBe(169 * 3_600_000);
  });

  it("moves an event by days keeping its clock time", () => {
    const sat = new Date("2026-10-24T17:00:00Z"); // 18:00 BST
    expect(iso(addLondonDays(sat, 2))).toBe("2026-10-26T18:00:00.000Z"); // 18:00 GMT
    expect(iso(addLondonDays(sat, -7))).toBe("2026-10-17T17:00:00.000Z");
  });
});

describe("term weeks", () => {
  it("calls the first week of Term 1 welcome week", () => {
    const w = termWeek("2026-09-30");
    expect(w.week).toBe(1);
    expect(w.welcomeWeek).toBe(true);
    expect(w.label).toBe("Week 1 (Welcome Week)");
    expect(w.termLabel).toBe("Term 1 · 28 Sep – 18 Dec");
  });

  it("numbers later weeks and flags reading week", () => {
    expect(termWeek("2026-10-05").label).toBe("Week 2");
    // 23:30Z on Sunday 25 Oct is still Sunday in GMT; 23:30Z the night before was Sunday in BST.
    expect(termWeek(new Date("2026-10-25T23:30:00Z")).label).toBe("Week 4");
    expect(termWeek(new Date("2026-10-24T23:30:00Z")).label).toBe("Week 4");
    expect(termWeek(new Date("2026-10-26T00:00:00Z")).label).toBe("Week 5");
    const reading = termWeek("2026-11-12");
    expect(reading.label).toBe("Week 7 (Reading Week)");
    expect(reading.readingWeek).toBe(true);
    expect(termWeek("2026-12-18").label).toBe("Week 12");
  });

  it("starts Term 2 at Week 1 without welcome week", () => {
    const w = termWeek("2027-01-11");
    expect(w.label).toBe("Week 1");
    expect(w.welcomeWeek).toBe(false);
    expect(termWeek("2027-02-17").label).toBe("Week 6 (Reading Week)");
  });

  it("labels vacations and the ends of the year", () => {
    const v = termWeek("2026-12-23");
    expect(v.term).toBeNull();
    expect(v.label).toBe("W/C 21 Dec");
    expect(v.termLabel).toBe("Vacation · 19 Dec – 10 Jan");
    expect(termWeek("2026-09-20").termLabel).toBe("Before Term 1 · until 27 Sep");
    expect(termWeek("2027-07-01").termLabel).toBe("After Term 3 · from 12 Jun");
  });
});
