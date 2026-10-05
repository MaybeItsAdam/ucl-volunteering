import { describe, expect, it, vi } from "vitest";

import {
  clampWindow,
  feedToRows,
  fetchTimetableFeed,
  isAllowedRedirect,
  isStale,
  MAX_WINDOW_DAYS,
  normaliseTimetableUrl,
  PAGE_NOT_LINK_ERROR,
  rowsHash,
  TimetableFeedError,
  validateFeedBody,
} from "./timetableFeed";

/**
 * A UCL-shaped feed: Europe/London VTIMEZONE, events with TZID, one weekly
 * RRULE that crosses the 25 Oct 2026 clocks-back weekend, a UTC one-off, a
 * cancelled session, an all-day "Reading week" and escaped TEXT.
 */
const UCL_FIXTURE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//UCL//Timetable//EN",
  "X-WR-CALNAME:UCL Timetable",
  "BEGIN:VTIMEZONE",
  "TZID:Europe/London",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "DTSTART:19700329T010000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "UID:COMP0002-LEC-1@timetable.ucl.ac.uk",
  "DTSTAMP:20261004T120000Z",
  "DTSTART;TZID=Europe/London:20261012T100000",
  "DTEND;TZID=Europe/London:20261012T110000",
  "RRULE:FREQ=WEEKLY;COUNT=4",
  "SUMMARY:COMP0002 Principles of Programming - Lecture",
  "LOCATION:Cruciform Building B.304 - Lecture Theatre 1",
  "DESCRIPTION:Module: COMP0002\\nLecturer: Dr A. Example\\, Prof B. Sample",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:COMP0004-LAB-7@timetable.ucl.ac.uk",
  "DTSTAMP:20261004T120000Z",
  "DTSTART:20261014T130000Z",
  "DTEND:20261014T150000Z",
  "SUMMARY:COMP0004 Lab",
  "LOCATION:Malet Place Engineering Building 1.20",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:COMP0004-LAB-8@timetable.ucl.ac.uk",
  "DTSTAMP:20261004T120000Z",
  "DTSTART;TZID=Europe/London:20261015T090000",
  "DTEND;TZID=Europe/London:20261015T100000",
  "STATUS:CANCELLED",
  "SUMMARY:COMP0004 Lab (cancelled)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:READING-WEEK@timetable.ucl.ac.uk",
  "DTSTAMP:20261004T120000Z",
  "DTSTART;VALUE=DATE:20261102",
  "DTEND;VALUE=DATE:20261107",
  "SUMMARY:Reading week",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const NOW = new Date("2026-10-05T12:00:00Z");

describe("normaliseTimetableUrl", () => {
  it("turns the Subscribe link's webcal:// into https://", () => {
    expect(normaliseTimetableUrl("webcal://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB")).toEqual({
      ok: true,
      url: "https://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB",
    });
  });

  it("accepts http, a bare host, ucl.ac.uk without www and stray whitespace", () => {
    for (const raw of [
      "http://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB",
      "  www.ucl.ac.uk/timetable/ics/PONIBF332NKJB \n",
      "https://ucl.ac.uk/timetable/ics/PONIBF332NKJB",
      "webcals://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB#x",
    ]) {
      expect(normaliseTimetableUrl(raw)).toEqual({
        ok: true,
        url: "https://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB",
      });
    }
  });

  it("names the timetable page as the wrong thing to paste", () => {
    for (const raw of [
      "https://timetable.ucl.ac.uk/tt/homePage.do",
      "https://timetable.ucl.ac.uk/",
      "https://www.ucl.ac.uk/timetable/",
    ]) {
      expect(normaliseTimetableUrl(raw)).toEqual({ ok: false, error: PAGE_NOT_LINK_ERROR });
    }
  });

  it("refuses every other host, scheme, port and credential", () => {
    for (const raw of [
      "https://calendar.google.com/calendar/ical/x/basic.ics",
      "https://evil.example/timetable/ics/PONIBF332NKJB",
      "https://www.ucl.ac.uk.evil.example/timetable/ics/PONIBF332NKJB",
      "ftp://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB",
      "https://www.ucl.ac.uk:8443/timetable/ics/PONIBF332NKJB",
      "https://user:pw@www.ucl.ac.uk/timetable/ics/PONIBF332NKJB",
      "https://127.0.0.1/timetable/ics/PONIBF332NKJB",
      "file:///etc/passwd",
      "",
    ]) {
      expect(normaliseTimetableUrl(raw).ok, raw).toBe(false);
    }
  });
});

describe("isAllowedRedirect", () => {
  it("allows https ucl.ac.uk hosts only", () => {
    expect(isAllowedRedirect(new URL("https://cmis.ucl.ac.uk/feed.ics"))).toBe(true);
    expect(isAllowedRedirect(new URL("http://www.ucl.ac.uk/x"))).toBe(false);
    expect(isAllowedRedirect(new URL("https://notucl.ac.uk/x"))).toBe(false);
    expect(isAllowedRedirect(new URL("https://169.254.169.254/latest"))).toBe(false);
  });
});

function response(status: number, body = "", headers: Record<string, string> = {}) {
  return new Response(status === 304 ? null : body, { status, headers });
}
const publicLookup = async () => [{ address: "144.82.250.10" }];

describe("fetchTimetableFeed", () => {
  const url = "https://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB";

  it("returns the body and validators, sending conditional headers", async () => {
    const fetchImpl = vi.fn(async () => response(200, UCL_FIXTURE, { etag: '"abc"', "last-modified": "Mon, 05 Oct 2026 10:00:00 GMT" }));
    const result = await fetchTimetableFeed(url, { etag: '"old"' }, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicLookup });
    expect(result).toMatchObject({ kind: "ok", etag: '"abc"' });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('"old"');
    expect(init.redirect).toBe("manual");
  });

  it("reports 304 as not-modified", async () => {
    const fetchImpl = async () => response(304);
    await expect(
      fetchTimetableFeed(url, { etag: '"abc"' }, { fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup }),
    ).resolves.toEqual({ kind: "not-modified" });
  });

  it("refuses a host that resolves to a private address", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchTimetableFeed(url, {}, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: async () => [{ address: "10.0.0.5" }] }),
    ).rejects.toBeInstanceOf(TimetableFeedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a redirect off ucl.ac.uk without following it", async () => {
    const fetchImpl = vi.fn(async () => response(302, "", { location: "http://169.254.169.254/latest/meta-data" }));
    await expect(
      fetchTimetableFeed(url, {}, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicLookup }),
    ).rejects.toThrow(/somewhere other than UCL/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a ucl.ac.uk redirect", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(301, "", { location: "https://timetable.ucl.ac.uk/ics/PONIBF332NKJB" }))
      .mockResolvedValueOnce(response(200, UCL_FIXTURE));
    const result = await fetchTimetableFeed(url, {}, { fetchImpl: fetchImpl as unknown as typeof fetch, lookupImpl: publicLookup });
    expect(result.kind).toBe("ok");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://timetable.ucl.ac.uk/ics/PONIBF332NKJB");
  });

  it("calls an HTML answer the timetable page, and a 404 a reset link", async () => {
    const html = async () => response(200, "<!DOCTYPE html><html>sign in</html>", { "content-type": "text/html" });
    await expect(
      fetchTimetableFeed(url, {}, { fetchImpl: html as typeof fetch, lookupImpl: publicLookup }),
    ).rejects.toThrow(PAGE_NOT_LINK_ERROR);
    const gone = async () => response(404);
    await expect(
      fetchTimetableFeed(url, {}, { fetchImpl: gone as typeof fetch, lookupImpl: publicLookup }),
    ).rejects.toThrow(/fresh Subscribe link/);
  });

  it("stops reading past the size cap", async () => {
    const huge = async () => response(200, "x", { "content-length": String(50 * 1024 * 1024) });
    await expect(
      fetchTimetableFeed(url, {}, { fetchImpl: huge as typeof fetch, lookupImpl: publicLookup }),
    ).rejects.toThrow(/larger than a timetable/);
  });

  it("times out a server that never answers", async () => {
    const hang = (_: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    await expect(
      fetchTimetableFeed(url, {}, { fetchImpl: hang as typeof fetch, lookupImpl: publicLookup, timeoutMs: 20 }),
    ).rejects.toThrow(/took too long/);
  });
});

describe("validateFeedBody", () => {
  it("accepts a VCALENDAR, BOM and all", () => {
    expect(() => validateFeedBody(`﻿${UCL_FIXTURE}`, "text/calendar")).not.toThrow();
  });
  it("rejects anything else", () => {
    expect(() => validateFeedBody("hello", "text/plain")).toThrow(TimetableFeedError);
  });
});

describe("feedToRows", () => {
  const { rows } = feedToRows(UCL_FIXTURE, NOW);

  it("expands the weekly lecture and keeps London wall time across the clocks going back", () => {
    const lectures = rows.filter((r) => r.title.startsWith("COMP0002"));
    expect(lectures.map((r) => r.startTime.toISOString())).toEqual([
      "2026-10-12T09:00:00.000Z", // BST: 10:00 London
      "2026-10-19T09:00:00.000Z",
      "2026-10-26T10:00:00.000Z", // GMT from 25 Oct: still 10:00 London
      "2026-11-02T10:00:00.000Z",
    ]);
    expect(lectures.every((r) => r.endTime.getTime() - r.startTime.getTime() === 3_600_000)).toBe(true);
    expect(new Set(lectures.map((r) => r.uid)).size).toBe(4);
  });

  it("unescapes text, drops cancelled and all-day entries, sorts by start", () => {
    expect(rows[0].location).toBe("Cruciform Building B.304 - Lecture Theatre 1");
    expect(rows[0].description).toBe("Module: COMP0002\nLecturer: Dr A. Example, Prof B. Sample");
    expect(rows.some((r) => /cancelled|Reading week/i.test(r.title))).toBe(false);
    expect(rows).toHaveLength(5);
    const starts = rows.map((r) => r.startTime.getTime());
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("drops what is outside the kept window", () => {
    const late = feedToRows(UCL_FIXTURE, new Date("2027-06-01T00:00:00Z"));
    expect(late.rows).toHaveLength(0);
  });

  it("hashes the same rows the same way even when DTSTAMP moves", () => {
    const restamped = UCL_FIXTURE.replaceAll("DTSTAMP:20261004T120000Z", "DTSTAMP:20261005T080000Z");
    expect(rowsHash(feedToRows(restamped, NOW).rows)).toBe(rowsHash(rows));
    const moved = UCL_FIXTURE.replace("Lecture Theatre 1", "Lecture Theatre 2");
    expect(rowsHash(feedToRows(moved, NOW).rows)).not.toBe(rowsHash(rows));
  });

  it("clips long text", () => {
    const long = UCL_FIXTURE.replace("SUMMARY:COMP0004 Lab", `SUMMARY:${"x".repeat(400)}`);
    const row = feedToRows(long, NOW).rows.find((r) => r.title.startsWith("x"))!;
    expect(row.title.length).toBeLessThanOrEqual(160);
    expect(row.title.endsWith("…")).toBe(true);
  });
});

describe("clampWindow", () => {
  it("defaults to two weeks back and eight ahead", () => {
    const { from, to } = clampWindow(null, null, NOW);
    expect(NOW.getTime() - from.getTime()).toBe(14 * 86_400_000);
    expect(to.getTime() - from.getTime()).toBe(56 * 86_400_000);
  });
  it("caps the span and repairs an inverted or invalid window", () => {
    const wide = clampWindow("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z", NOW);
    expect(wide.to.getTime() - wide.from.getTime()).toBe(MAX_WINDOW_DAYS * 86_400_000);
    const inverted = clampWindow("2026-10-10T00:00:00Z", "2026-10-01T00:00:00Z", NOW);
    expect(inverted.to > inverted.from).toBe(true);
    const junk = clampWindow("nope", "also nope", NOW);
    expect(junk.to > junk.from).toBe(true);
  });
});

describe("isStale", () => {
  it("is stale after six hours or when never fetched", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale(new Date(NOW.getTime() - 5 * 3_600_000), NOW)).toBe(false);
    expect(isStale(new Date(NOW.getTime() - 7 * 3_600_000), NOW)).toBe(true);
  });
});
