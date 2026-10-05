/**
 * Time for the plan, all of it in Europe/London.
 *
 * Rows are stored as UTC instants; the committee thinks in London wall time.
 * Everything that turns one into the other lives here, and none of it touches
 * the process's own timezone (Vercel runs in UTC, a laptop in BST), so the
 * same instant gives the same answer on the server and in the browser.
 *
 * Days are handled as `YYYY-MM-DD` keys and counted in whole UTC days, as the
 * Apps Script did, so British Summer Time can never shift a week.
 */

export const LONDON = "Europe/London";
export const MINUTES_PER_DAY = 24 * 60;
export const SNAP_MINUTES = 15;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

// ── Wall time ↔ instant ──────────────────────────────────────────────────

export interface WallTime {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // Throws RangeError for an unknown zone, which callers rely on.
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock reading in `timeZone` at an instant. */
export function wallTimeOf(date: Date, timeZone: string = LONDON): WallTime {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Minutes the zone is ahead of UTC at an instant (London: 0 or 60). */
export function zoneOffsetMinutes(date: Date, timeZone: string = LONDON): number {
  const w = wallTimeOf(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const ms = date.getTime() - (date.getTime() % 1000 + 1000) % 1000;
  return Math.round((asUtc - ms) / 60_000);
}

/**
 * The instant a wall-clock reading in `timeZone` names.
 *
 * Two readings need a rule. One that happens twice (01:30 on the night the
 * clocks go back) is the first of them, as RFC 5545 says. One that never
 * happens (01:30 on the night they go forward) is read with the offset from
 * before the change, so it lands an hour later, as a calendar app would.
 */
export function wallTimeToDate(wall: Partial<WallTime> & Pick<WallTime, "year" | "month" | "day">, timeZone: string = LONDON): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour ?? 0, wall.minute ?? 0, wall.second ?? 0);
  const before = zoneOffsetMinutes(new Date(guess - 1.5 * DAY_MS), timeZone);
  const after = zoneOffsetMinutes(new Date(guess + 1.5 * DAY_MS), timeZone);
  const valid = [before, after]
    .map((offset) => guess - offset * 60_000)
    .filter((t) => zoneOffsetMinutes(new Date(t), timeZone) * 60_000 === guess - t);
  if (valid.length) return new Date(Math.min(...valid));
  return new Date(guess - before * 60_000);
}

// ── Day keys ─────────────────────────────────────────────────────────────

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const n = dayNumber(value);
  return new Date(n * DAY_MS).toISOString().slice(0, 10) === value;
}

/** The London calendar day an instant falls on, as `YYYY-MM-DD`. */
export function londonDayKey(date: Date): string {
  const w = wallTimeOf(date);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

function dayNumber(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / DAY_MS;
}

/** `key` moved by whole calendar days. */
export function shiftDayKey(key: string, days: number): string {
  return new Date((dayNumber(key) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** ISO weekday of a day key: Monday 1 … Sunday 7. */
export function isoWeekday(key: string): number {
  const d = new Date(dayNumber(key) * DAY_MS).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The Monday of the week `key` is in. */
export function mondayOf(key: string): string {
  return shiftDayKey(key, 1 - isoWeekday(key));
}

/** "3 Oct" */
export function shortDate(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
}

// ── Minutes of the day ───────────────────────────────────────────────────

/** London midnight at the start of a day. */
export function startOfLondonDay(key: string): Date {
  return londonDateAt(key, 0);
}

/**
 * The instant `minute` minutes of wall-clock time after London midnight on
 * `key` — so 9 * 60 is 09:00 on the clock, whichever side of a clock change.
 * Minutes past 1440 roll into the next day.
 */
export function londonDateAt(key: string, minute: number): Date {
  const whole = Math.floor(minute / MINUTES_PER_DAY);
  const day = whole ? shiftDayKey(key, whole) : key;
  const rest = minute - whole * MINUTES_PER_DAY;
  return wallTimeToDate({
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)),
    day: Number(day.slice(8, 10)),
    hour: Math.floor(rest / 60),
    minute: rest % 60,
  });
}

/** Minutes after London midnight on the clock, 0–1439. */
export function londonMinuteOfDay(date: Date): number {
  const w = wallTimeOf(date);
  return w.hour * 60 + w.minute;
}

/** "09:05" from 545. */
export function formatMinute(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** The London clock time of an instant, "18:30". */
export function londonTime(date: Date): string {
  return formatMinute(londonMinuteOfDay(date));
}

/** Rounded to the nearest `step` minutes (ties go later). */
export function snapMinute(minute: number, step: number = SNAP_MINUTES): number {
  return Math.round(minute / step) * step;
}

/** An instant moved to the nearest `step` minutes of London wall time. */
export function snapDate(date: Date, step: number = SNAP_MINUTES): Date {
  const key = londonDayKey(date);
  return londonDateAt(key, snapMinute(londonMinuteOfDay(date) + wallTimeOf(date).second / 60, step));
}

// ── Weeks ────────────────────────────────────────────────────────────────

export interface WeekBounds {
  /** Monday, `YYYY-MM-DD`. */
  monday: string;
  /** London midnight starting Monday. */
  start: Date;
  /** London midnight starting the next Monday: exclusive. */
  end: Date;
  /** The seven day keys, Monday first. */
  days: string[];
}

/** The Monday-to-Sunday London week containing an instant or a day key. */
export function londonWeek(at: Date | string): WeekBounds {
  const monday = mondayOf(typeof at === "string" ? at : londonDayKey(at));
  return {
    monday,
    start: startOfLondonDay(monday),
    end: startOfLondonDay(shiftDayKey(monday, 7)),
    days: Array.from({ length: 7 }, (_, i) => shiftDayKey(monday, i)),
  };
}

/**
 * An instant moved by whole days keeping its London clock time, so an event
 * dragged across the October change still starts at 18:00.
 */
export function addLondonDays(date: Date, days: number): Date {
  return londonDateAt(shiftDayKey(londonDayKey(date), days), londonMinuteOfDay(date));
}

// ── Terms ────────────────────────────────────────────────────────────────

export interface Term {
  name: string;
  /** First day, inclusive. */
  start: string;
  /** Last day, inclusive. */
  end: string;
}

/** UCL term dates, in order. Add the next year's when UCL publishes them. */
export const TERMS: Term[] = [
  { name: "Term 1", start: "2026-09-28", end: "2026-12-18" },
  { name: "Term 2", start: "2027-01-11", end: "2027-03-25" },
  { name: "Term 3", start: "2027-04-26", end: "2027-06-11" },
];

/** Mondays of the reading weeks. */
export const READING_WEEKS = ["2026-11-09", "2027-02-15"];

/** The term week that is UCL's welcome week: Term 1, Week 1. */
const WELCOME_WEEK_TERM = "Term 1";

export interface TermWeek {
  /** The Monday of the week. */
  monday: string;
  /** The term the Monday's week touches, or null in a vacation. */
  term: Term | null;
  /** 1-based week of the term, or null outside term. */
  week: number | null;
  welcomeWeek: boolean;
  readingWeek: boolean;
  /** "Week 1 (Welcome Week)", "Week 7 (Reading Week)", "Week 3", "W/C 21 Dec". */
  label: string;
  /** "Term 1 · 28 Sep – 18 Dec", "Vacation · 19 Dec – 10 Jan", "Before Term 1 · until 27 Sep". */
  termLabel: string;
}

function termOfWeek(monday: string): Term | null {
  const sunday = shiftDayKey(monday, 6);
  return TERMS.find((t) => t.start <= sunday && t.end >= monday) ?? null;
}

/** Where a week (given by any instant or day in it) sits in the UCL year. */
export function termWeek(at: Date | string): TermWeek {
  const monday = mondayOf(typeof at === "string" ? at : londonDayKey(at));
  const readingWeek = READING_WEEKS.includes(monday);
  const term = termOfWeek(monday);

  if (term) {
    const week = Math.round(daysBetween(mondayOf(term.start), monday) / 7) + 1;
    const welcomeWeek = week === 1 && term.name === WELCOME_WEEK_TERM;
    const note = welcomeWeek ? " (Welcome Week)" : readingWeek ? " (Reading Week)" : "";
    return {
      monday,
      term,
      week,
      welcomeWeek,
      readingWeek,
      label: `Week ${week}${note}`,
      termLabel: `${term.name} · ${shortDate(term.start)} – ${shortDate(term.end)}`,
    };
  }

  const before = TERMS.filter((t) => t.end < monday).pop();
  const after = TERMS.find((t) => t.start > monday);
  const termLabel = before
    ? after
      ? `Vacation · ${shortDate(shiftDayKey(before.end, 1))} – ${shortDate(shiftDayKey(after.start, -1))}`
      : `After ${before.name} · from ${shortDate(shiftDayKey(before.end, 1))}`
    : after
      ? `Before ${after.name} · until ${shortDate(shiftDayKey(after.start, -1))}`
      : "Out of term";
  return {
    monday,
    term: null,
    week: null,
    welcomeWeek: false,
    readingWeek,
    label: `W/C ${shortDate(monday)}`,
    termLabel,
  };
}
