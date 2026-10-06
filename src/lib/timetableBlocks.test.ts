import { describe, expect, it } from "vitest";
import { BUSY_NOTE, isTimetableBlock, PERSONAL_BUSY_NOTE, sessionsToBlocks } from "./timetableBlocks";

describe("sessionsToBlocks", () => {
  it("places a session on its London weekday and minutes (BST)", () => {
    // Tue 6 Oct 2026, 10:00–11:00 London = 09:00–10:00 UTC.
    const [block] = sessionsToBlocks([
      { memberId: "m1", uid: "u1", startsAt: "2026-10-06T09:00:00Z", endsAt: "2026-10-06T10:00:00Z", title: "STAT0002", location: "Cruciform B404" },
    ]);
    expect(block).toMatchObject({ memberId: "m1", weekday: 2, startMinute: 600, endMinute: 660, note: "STAT0002 · Cruciform B404" });
    expect(isTimetableBlock(block)).toBe(true);
  });

  it("uses GMT after the clocks go back", () => {
    // Mon 2 Nov 2026, 10:00 UTC = 10:00 London.
    const [block] = sessionsToBlocks([{ memberId: "m1", startsAt: "2026-11-02T10:00:00Z", endsAt: "2026-11-02T11:00:00Z" }]);
    expect(block).toMatchObject({ weekday: 1, startMinute: 600, endMinute: 660 });
  });

  it("says only that someone is busy when there is no title", () => {
    const [block] = sessionsToBlocks([{ memberId: "m2", startsAt: "2026-10-06T09:00:00Z", endsAt: "2026-10-06T10:00:00Z" }]);
    expect(block.note).toBe(BUSY_NOTE);
  });

  it("splits a session that runs past midnight", () => {
    // Fri 9 Oct 22:00 → Sat 10 Oct 01:00 London.
    const blocks = sessionsToBlocks([{ memberId: "m1", startsAt: "2026-10-09T21:00:00Z", endsAt: "2026-10-10T00:00:00Z" }]);
    expect(blocks.map((b) => [b.weekday, b.startMinute, b.endMinute])).toEqual([
      [5, 22 * 60, 24 * 60],
      [6, 0, 60],
    ]);
  });

  it("ends a session at midnight on the day it started", () => {
    const blocks = sessionsToBlocks([{ memberId: "m1", startsAt: "2026-10-09T21:00:00Z", endsAt: "2026-10-09T23:00:00Z" }]);
    expect(blocks.map((b) => [b.weekday, b.startMinute, b.endMinute])).toEqual([[5, 22 * 60, 24 * 60]]);
  });

  it("keeps only the days asked for", () => {
    const blocks = sessionsToBlocks(
      [
        { memberId: "m1", startsAt: "2026-10-05T09:00:00Z", endsAt: "2026-10-05T10:00:00Z" },
        { memberId: "m1", startsAt: "2026-10-12T09:00:00Z", endsAt: "2026-10-12T10:00:00Z" },
      ],
      ["2026-10-05"],
    );
    expect(blocks).toHaveLength(1);
  });

  it("skips empty or backwards sessions", () => {
    expect(sessionsToBlocks([{ memberId: "m1", startsAt: "2026-10-05T10:00:00Z", endsAt: "2026-10-05T10:00:00Z" }])).toEqual([]);
  });

  it("says only 'Busy' for someone else's personal calendar, and which one to its owner", () => {
    const session = { memberId: "m1", uid: "a", startsAt: "2026-10-05T09:00:00Z", endsAt: "2026-10-05T10:00:00Z" };
    const [theirs] = sessionsToBlocks([{ ...session, kind: "google" }]);
    expect(theirs.note).toBe(PERSONAL_BUSY_NOTE);
    const [mine] = sessionsToBlocks([{ ...session, kind: "outlook", mine: true }]);
    expect(mine.note).toBe("Busy (Outlook)");
    const [lecture] = sessionsToBlocks([{ ...session, kind: "ucl_timetable" }]);
    expect(lecture.note).toBe(BUSY_NOTE);
  });
});

