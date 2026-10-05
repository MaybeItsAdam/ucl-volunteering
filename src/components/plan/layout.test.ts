import { describe, expect, it } from "vitest";
import { londonDateAt, londonWeek } from "@/lib/planTime";
import type { PlanEvent } from "@/lib/types";
import {
  clampToWindow,
  dragStartMinute,
  eventDaySpan,
  layoutWeek,
  packColumns,
  resizeEndMinute,
  selectionRange,
  WINDOW_END,
  WINDOW_START,
} from "./layout";

const iv = (id: string, start: number, end: number) => ({ id, start, end });

function event(id: string, day: string, start: number, end: number, extra: Partial<PlanEvent> = {}): PlanEvent {
  return {
    id,
    source: "volsoc",
    category: "social",
    title: id,
    startsAt: londonDateAt(day, start).toISOString(),
    endsAt: londonDateAt(day, end).toISOString(),
    allDay: false,
    location: null,
    description: null,
    url: null,
    status: "confirmed",
    leadMemberId: null,
    linkedEventId: null,
    planDocUrl: null,
    instagramUrl: null,
    recapUrl: null,
    notes: null,
    targetVolunteers: null,
    actualAttendance: null,
    removedAt: null,
    createdBy: null,
    updatedAt: new Date(0).toISOString(),
    responses: [],
    ...extra,
  };
}

describe("packColumns", () => {
  it("gives a lone item the whole width", () => {
    expect(packColumns([iv("a", 60, 120)])).toEqual([{ id: "a", column: 0, columns: 1, span: 1 }]);
  });

  it("puts two overlapping items side by side", () => {
    expect(packColumns([iv("a", 60, 120), iv("b", 90, 150)])).toEqual([
      { id: "a", column: 0, columns: 2, span: 1 },
      { id: "b", column: 1, columns: 2, span: 1 },
    ]);
  });

  it("doesn't treat touching items as overlapping", () => {
    const placed = packColumns([iv("a", 60, 120), iv("b", 120, 180)]);
    expect(placed.map((p) => p.columns)).toEqual([1, 1]);
  });

  it("reuses a column freed earlier in the cluster", () => {
    // a long; b then c one after the other beside it.
    const placed = packColumns([iv("a", 0, 300), iv("b", 0, 100), iv("c", 150, 250)]);
    expect(placed).toEqual([
      { id: "a", column: 0, columns: 2, span: 1 },
      { id: "b", column: 1, columns: 2, span: 1 },
      { id: "c", column: 1, columns: 2, span: 1 },
    ]);
  });

  it("doesn't stretch an item over a column still in use", () => {
    // a, b and c all overlap at 30–50: three columns. d comes after a and c have ended.
    const placed = packColumns([iv("a", 0, 60), iv("b", 30, 120), iv("c", 30, 50), iv("d", 90, 150)]);
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(byId.b.columns).toBe(3);
    // d takes column 0, a's, and can't stretch: b is still running in column 1.
    expect(byId.d.column).toBe(0);
    expect(byId.d.span).toBe(1);
    // c sits in column 2 and nothing is to its right.
    expect(byId.c).toMatchObject({ column: 2, span: 1 });
  });

  it("lets the last column stretch when there's room", () => {
    const placed = packColumns([iv("a", 0, 120), iv("b", 0, 60), iv("c", 0, 30), iv("x", 60, 120)]);
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(byId.a).toMatchObject({ column: 0, columns: 3 });
    // x starts at 60 in column 1 (b's), and column 2 (c's) is free by then.
    expect(byId.x).toMatchObject({ column: 1, span: 2 });
  });

  it("starts a fresh cluster once everything has ended", () => {
    const placed = packColumns([iv("a", 0, 60), iv("b", 0, 60), iv("c", 60, 90)]);
    expect(placed.map((p) => p.columns)).toEqual([2, 2, 1]);
  });

  it("returns items in the order given", () => {
    const placed = packColumns([iv("late", 500, 600), iv("early", 0, 10)]);
    expect(placed.map((p) => p.id)).toEqual(["late", "early"]);
  });

  it("puts the longer of two same-start items first", () => {
    const placed = packColumns([iv("short", 0, 30), iv("long", 0, 120)]);
    expect(placed.find((p) => p.id === "long")!.column).toBe(0);
  });
});

describe("clampToWindow", () => {
  it("passes an in-window interval through", () => {
    expect(clampToWindow(600, 660)).toEqual({ top: 600, bottom: 660, clippedStart: false, clippedEnd: false });
  });

  it("clips the start of an early event", () => {
    expect(clampToWindow(420, 540)).toMatchObject({ top: WINDOW_START, bottom: 540, clippedStart: true });
  });

  it("parks an event wholly before the window at its top edge", () => {
    const c = clampToWindow(360, 420);
    expect(c.top).toBe(WINDOW_START);
    expect(c.bottom).toBeGreaterThan(WINDOW_START);
    expect(c.clippedStart).toBe(true);
  });

  it("parks an event wholly after the window at its bottom edge", () => {
    const c = clampToWindow(1350, 1410);
    expect(c.bottom).toBe(WINDOW_END);
    expect(c.top).toBeLessThan(WINDOW_END);
    expect(c.clippedEnd).toBe(true);
  });

  it("draws a very short event at the minimum height", () => {
    const c = clampToWindow(600, 605);
    expect(c.bottom - c.top).toBeGreaterThanOrEqual(20);
  });
});

describe("layoutWeek", () => {
  // Welcome Week 2026: Mon 28 Sep – Sun 4 Oct, in BST.
  const week = londonWeek("2026-09-30");

  it("places a timed event on its London day in London minutes", () => {
    const layout = layoutWeek([event("a", "2026-09-30", 18 * 60, 20 * 60)], week.days);
    const [seg] = layout.days["2026-09-30"];
    expect(seg).toMatchObject({ start: 1080, end: 1200, top: 1080, bottom: 1200, column: 0, columns: 1 });
    expect(layout.counts["2026-09-30"]).toBe(1);
    expect(layout.counts["2026-09-29"]).toBe(0);
  });

  it("splits an event over midnight across two days", () => {
    const e = event("late", "2026-10-02", 21 * 60, 26 * 60); // Fri 21:00 → Sat 02:00
    const layout = layoutWeek([e], week.days);
    expect(layout.days["2026-10-02"][0]).toMatchObject({ start: 1260, end: 1440, continuesTo: true, clippedEnd: true });
    expect(layout.days["2026-10-03"][0]).toMatchObject({ start: 0, end: 120, continuesFrom: true, clippedStart: true });
    expect(layout.counts["2026-10-03"]).toBe(1);
  });

  it("doesn't put an event ending at midnight on the next day", () => {
    const e = event("eve", "2026-09-28", 20 * 60, 24 * 60);
    expect(eventDaySpan(e)).toEqual({ first: "2026-09-28", last: "2026-09-28" });
    const layout = layoutWeek([e], week.days);
    expect(layout.days["2026-09-28"][0]).toMatchObject({ end: 1440, continuesTo: false });
    expect(layout.days["2026-09-29"]).toHaveLength(0);
  });

  it("puts all-day events in the strip, stacked when they overlap", () => {
    const a = event("a", "2026-09-28", 0, 3 * 1440, { allDay: true }); // Mon–Wed
    const b = event("b", "2026-09-29", 0, 1440, { allDay: true }); // Tue
    const c = event("c", "2026-10-01", 0, 1440, { allDay: true }); // Thu
    const layout = layoutWeek([a, b, c], week.days);
    expect(layout.allDay.map((x) => [x.event.id, x.firstDay, x.lastDay, x.row])).toEqual([
      ["a", 0, 2, 0],
      ["b", 1, 1, 1],
      ["c", 3, 3, 0],
    ]);
    expect(layout.days["2026-09-28"]).toHaveLength(0);
    expect(layout.counts["2026-09-29"]).toBe(2);
  });

  it("clips an all-day run to the week", () => {
    const e = event("long", "2026-09-25", 0, 5 * 1440, { allDay: true }); // Fri before → Tue
    const layout = layoutWeek([e], week.days);
    expect(layout.allDay[0]).toMatchObject({ firstDay: 0, lastDay: 1 });
  });

  it("leaves out events from other weeks", () => {
    const layout = layoutWeek([event("x", "2026-10-05", 600, 660)], week.days);
    expect(Object.values(layout.days).flat()).toHaveLength(0);
  });

  it("packs overlapping events into columns per day", () => {
    const layout = layoutWeek(
      [event("a", "2026-09-30", 600, 720), event("b", "2026-09-30", 660, 780), event("c", "2026-10-01", 660, 780)],
      week.days,
    );
    expect(layout.days["2026-09-30"].map((s) => [s.event.id, s.column, s.columns])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
    ]);
    expect(layout.days["2026-10-01"][0].columns).toBe(1);
  });

  it("keeps London clock time across the October change", () => {
    // Clocks go back on Sun 25 Oct 2026.
    const w = londonWeek("2026-10-26");
    const layout = layoutWeek([event("gmt", "2026-10-26", 18 * 60, 19 * 60)], w.days);
    expect(layout.days["2026-10-26"][0]).toMatchObject({ start: 1080, end: 1140 });
  });
});

describe("drag arithmetic", () => {
  it("snaps a dragged start to 15 minutes", () => {
    expect(dragStartMinute(607, 60)).toBe(600);
    expect(dragStartMinute(608, 60)).toBe(615);
  });

  it("keeps a dragged event inside the window", () => {
    expect(dragStartMinute(300, 60)).toBe(WINDOW_START);
    expect(dragStartMinute(1400, 60)).toBe(WINDOW_END - 15);
  });

  it("keeps a long event on its day", () => {
    expect(dragStartMinute(1300, 300)).toBe(1440 - 300);
  });

  it("keeps a resized end at least 15 minutes after the start", () => {
    expect(resizeEndMinute(605, 600)).toBe(615);
    expect(resizeEndMinute(700, 600)).toBe(705);
    expect(resizeEndMinute(1500, 600)).toBe(1440);
  });

  it("turns a click into an hour and a drag into its snapped span", () => {
    expect(selectionRange(605, 605)).toEqual({ start: 600, end: 660 });
    expect(selectionRange(700, 602)).toEqual({ start: 600, end: 705 });
  });
});
