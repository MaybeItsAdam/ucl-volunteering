import {
  daysBetween,
  londonDayKey,
  londonMinuteOfDay,
  MINUTES_PER_DAY,
  shiftDayKey,
  snapMinute,
  SNAP_MINUTES,
} from "@/lib/planTime";
import type { PlanEvent } from "@/lib/types";

/**
 * Where the week planner puts things. Pure, so it can be tested without a DOM:
 * the grid component turns minutes into pixels and nothing else.
 */

/** The grid shows 08:00 to 22:00. */
export const WINDOW_START = 8 * 60;
export const WINDOW_END = 22 * 60;
/** 1 hour = 60px, so a minute is a pixel. */
export const PX_PER_MINUTE = 1;
/** The shortest a card is drawn, so a 5-minute event can still be hit. */
export const MIN_CARD_MINUTES = 20;
const SNAP = SNAP_MINUTES;

// ── Column packing ───────────────────────────────────────────────────────

export interface Interval {
  id: string;
  start: number;
  end: number;
}

export interface Placed {
  id: string;
  /** 0-based column the item sits in. */
  column: number;
  /** Columns in its cluster: its width is `span / columns` of the day. */
  columns: number;
  /** How many columns it covers, from `column` rightwards (1 or more). */
  span: number;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * Lay out overlapping intervals side by side, as a calendar does.
 *
 * Sorted by start (longer first on a tie), the intervals fall into clusters
 * that transitively overlap; each cluster gets as many columns as it needs,
 * each interval the leftmost column free at its start. Then each interval
 * stretches right over any columns it overlaps nothing in, so a lone long
 * event beside two short ones isn't left at a third of the width.
 *
 * Touching intervals (one ends as the next starts) don't overlap.
 */
export function packColumns(items: readonly Interval[]): Placed[] {
  const sorted = [...items]
    .map((item) => ({ ...item, end: Math.max(item.end, item.start) }))
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.id.localeCompare(b.id));

  const out = new Map<string, Placed>();
  let cluster: { item: Interval; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const columns = columnEnds.length;
    for (const { item, column } of cluster) {
      let span = 1;
      while (
        column + span < columns &&
        !cluster.some((other) => other.column === column + span && other.item !== item && overlaps(other.item, item))
      ) {
        span++;
      }
      out.set(item.id, { id: item.id, column, columns, span });
    }
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[column] = item.end;
    }
    cluster.push({ item, column });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();

  // In the order given, so callers can zip.
  return items.map((item) => out.get(item.id)!);
}

// ── Events into days ─────────────────────────────────────────────────────

/** One event's part of one day, in London minutes of that day. */
export interface DaySegment {
  event: PlanEvent;
  day: string;
  /** True minutes, 0–1440. */
  start: number;
  end: number;
  /** As drawn: clamped into the visible window, never shorter than MIN_CARD_MINUTES. */
  top: number;
  bottom: number;
  /** It starts before the window (or the day): draw an "earlier" marker. */
  clippedStart: boolean;
  /** It ends after the window (or the day). */
  clippedEnd: boolean;
  /** Starts before this day (continues from yesterday). */
  continuesFrom: boolean;
  /** Ends after this day. */
  continuesTo: boolean;
  column: number;
  columns: number;
  span: number;
}

export interface AllDayItem {
  event: PlanEvent;
  /** Index into the week's days of its first and last visible day (inclusive). */
  firstDay: number;
  lastDay: number;
  /** Stacking row in the all-day strip. */
  row: number;
}

export interface WeekLayout {
  allDay: AllDayItem[];
  /** Timed segments per day key, in the order they should paint. */
  days: Record<string, DaySegment[]>;
  /** Count of events touching each day (all-day included). */
  counts: Record<string, number>;
}

/** An all-day event, or a timed one of 24 hours or more, goes in the strip. */
export function isAllDayLike(event: PlanEvent): boolean {
  return event.allDay || Date.parse(event.endsAt) - Date.parse(event.startsAt) >= MINUTES_PER_DAY * 60_000;
}

/** First and last London day an event covers, end exclusive (an event ending at midnight doesn't touch the next day). */
export function eventDaySpan(event: PlanEvent): { first: string; last: string } {
  const start = new Date(event.startsAt);
  const end = new Date(Math.max(Date.parse(event.endsAt), start.getTime()));
  const first = londonDayKey(start);
  let last = londonDayKey(end);
  if (end.getTime() > start.getTime() && londonMinuteOfDay(end) === 0 && last > first) last = shiftDayKey(last, -1);
  return { first, last };
}

/** Clamp a true interval to what the grid shows. */
export function clampToWindow(start: number, end: number, windowStart = WINDOW_START, windowEnd = WINDOW_END) {
  const minLen = MIN_CARD_MINUTES;
  let top = Math.max(start, windowStart);
  let bottom = Math.min(Math.max(end, start + minLen), windowEnd);
  if (top >= windowEnd) top = windowEnd - minLen;
  if (bottom <= windowStart) bottom = windowStart + minLen;
  if (bottom - top < minLen) {
    if (top + minLen <= windowEnd) bottom = top + minLen;
    else top = bottom - minLen;
  }
  return { top, bottom, clippedStart: start < windowStart, clippedEnd: end > windowEnd };
}

/** Lay a week of events out: the all-day strip, and timed segments per day packed into columns. */
export function layoutWeek(events: readonly PlanEvent[], days: readonly string[]): WeekLayout {
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const result: WeekLayout = { allDay: [], days: {}, counts: {} };
  for (const day of days) {
    result.days[day] = [];
    result.counts[day] = 0;
  }

  const allDayRows: number[][] = []; // per row, the lastDay index of each item in it
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));

  for (const event of sorted) {
    const span = eventDaySpan(event);
    if (span.last < firstDay || span.first > lastDay) continue;
    const from = Math.max(0, daysBetween(firstDay, span.first));
    const to = Math.min(days.length - 1, daysBetween(firstDay, span.last));
    for (let i = from; i <= to; i++) result.counts[days[i]]++;

    if (isAllDayLike(event)) {
      let row = allDayRows.findIndex((ends) => ends.every((end) => end < from));
      if (row === -1) {
        row = allDayRows.length;
        allDayRows.push([]);
      }
      allDayRows[row].push(to);
      result.allDay.push({ event, firstDay: from, lastDay: to, row });
      continue;
    }

    const startMinute = londonMinuteOfDay(new Date(event.startsAt));
    const endMinute = londonMinuteOfDay(new Date(event.endsAt));
    for (let i = from; i <= to; i++) {
      const day = days[i];
      const continuesFrom = day !== span.first;
      const continuesTo = day !== span.last;
      const start = continuesFrom ? 0 : startMinute;
      // Ending at midnight on its last day means the end of that day, not its start.
      const endsAtMidnight = endMinute === 0 && Date.parse(event.endsAt) > Date.parse(event.startsAt);
      const end = continuesTo || endsAtMidnight ? MINUTES_PER_DAY : endMinute;
      const clamp = clampToWindow(start, Math.max(end, start));
      result.days[day].push({
        event,
        day,
        start,
        end: Math.max(end, start),
        top: clamp.top,
        bottom: clamp.bottom,
        clippedStart: clamp.clippedStart || continuesFrom,
        clippedEnd: clamp.clippedEnd || continuesTo,
        continuesFrom,
        continuesTo,
        column: 0,
        columns: 1,
        span: 1,
      });
    }
  }

  // Pack by the drawn box, so clamped cards at the window's edge don't sit on each other.
  for (const day of days) {
    const segments = result.days[day];
    const placed = packColumns(segments.map((s) => ({ id: s.event.id, start: s.top, end: s.bottom })));
    placed.forEach((p, i) => Object.assign(segments[i], { column: p.column, columns: p.columns, span: p.span }));
  }
  return result;
}

// ── Drag arithmetic ──────────────────────────────────────────────────────

/** A dragged event's new start: snapped, kept on its day and inside the window. */
export function dragStartMinute(rawStart: number, duration: number, step = SNAP): number {
  const latest = Math.max(WINDOW_START, Math.min(MINUTES_PER_DAY - duration, WINDOW_END - step));
  return Math.min(Math.max(snapMinute(rawStart, step), WINDOW_START), latest);
}

/** A resized event's new end: snapped, at least 15 minutes after its start, no later than midnight. */
export function resizeEndMinute(rawEnd: number, start: number, step = SNAP): number {
  return Math.min(Math.max(snapMinute(rawEnd, step), start + step), MINUTES_PER_DAY);
}

/** The minutes an empty-grid drag covers, snapped; a click gives an hour. */
export function selectionRange(a: number, b: number, step = SNAP): { start: number; end: number } {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const start = Math.max(0, Math.min(Math.floor(lo / step) * step, MINUTES_PER_DAY - step));
  let end = Math.ceil(hi / step) * step;
  if (end - start < 30) end = start + 60;
  return { start, end: Math.min(end, MINUTES_PER_DAY) };
}
