/**
 * The availability grid, as plain data.
 *
 * The editor thinks in 30-minute cells; the server stores blocks
 * (`weekday`, `startMinute`, `endMinute`, `note`). Everything that turns one
 * into the other, and everything the combined view works out (who is out when,
 * when everyone is free, the best time to meet), lives here with no React, so
 * it can be tested on its own.
 *
 * Weekdays are ISO (Mon = 1 … Sun = 7); minutes are after London midnight.
 */

import type { AvailabilityBlock } from "@/lib/types";

/** One cell of the grid: half an hour. */
export const SLOT_MINUTES = 30;

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The hours the spreadsheet tab covered, and the wider view. */
export const DAY_RANGE = { start: 8 * 60, end: 20 * 60 } as const;
export const WIDE_RANGE = { start: 7 * 60, end: 22 * 60 } as const;

export const WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const WHOLE_WEEK = [1, 2, 3, 4, 5, 6, 7] as const;

/** A block as the editor sends it: no id, no member. */
export type BlockInput = Omit<AvailabilityBlock, "id" | "memberId">;

export interface MinuteRange {
  start: number;
  end: number;
}

export const weekdayShort = (weekday: number) => WEEKDAY_SHORT[weekday - 1] ?? "?";
export const weekdayLong = (weekday: number) => WEEKDAY_LONG[weekday - 1] ?? "?";

/** The cells' start minutes from `range.start` up to (not including) `range.end`. */
export function slotsIn(range: MinuteRange): number[] {
  const out: number[] = [];
  for (let m = range.start; m < range.end; m += SLOT_MINUTES) out.push(m);
  return out;
}

// ── Cells ────────────────────────────────────────────────────────────────

/**
 * The cells marked unavailable, keyed `"weekday:minute"`, each with its note
 * (null for none). A cell not in the map is free.
 */
export type Cells = ReadonlyMap<string, string | null>;

export const cellKey = (weekday: number, minute: number) => `${weekday}:${minute}`;

export function parseCellKey(key: string): { weekday: number; minute: number } {
  const [weekday, minute] = key.split(":").map(Number);
  return { weekday, minute };
}

const cleanNote = (note: string | null | undefined): string | null => (note ?? "").trim() || null;

/**
 * Blocks → cells. A block that does not sit on the half-hour grid covers every
 * cell it touches, so nothing marked unavailable is lost by opening the editor.
 * Where two blocks share a cell, the later block's note wins unless it has none.
 */
export function blocksToCells(blocks: readonly BlockInput[]): Map<string, string | null> {
  const cells = new Map<string, string | null>();
  for (const block of blocks) {
    const from = Math.floor(block.startMinute / SLOT_MINUTES) * SLOT_MINUTES;
    const note = cleanNote(block.note);
    for (let m = from; m < block.endMinute; m += SLOT_MINUTES) {
      const key = cellKey(block.weekday, m);
      if (note !== null || !cells.has(key)) cells.set(key, note);
    }
  }
  return cells;
}

/**
 * Cells → blocks: sorted by day then time, with each run of touching cells of
 * the same note joined into one block. Cells with different notes stay as
 * separate blocks so neither note is lost.
 */
export function cellsToBlocks(cells: Cells): BlockInput[] {
  const sorted = [...cells.entries()]
    .map(([key, note]) => ({ ...parseCellKey(key), note: cleanNote(note) }))
    .sort((a, b) => a.weekday - b.weekday || a.minute - b.minute);
  const blocks: BlockInput[] = [];
  for (const cell of sorted) {
    const last = blocks.at(-1);
    if (last && last.weekday === cell.weekday && last.endMinute === cell.minute && last.note === cell.note) {
      last.endMinute += SLOT_MINUTES;
    } else {
      blocks.push({ weekday: cell.weekday, startMinute: cell.minute, endMinute: cell.minute + SLOT_MINUTES, note: cell.note });
    }
  }
  return blocks;
}

/** A stable fingerprint of a set of blocks, to tell whether the editor has unsaved changes. */
export function blocksSignature(blocks: readonly BlockInput[]): string {
  return cellsToBlocks(blocksToCells(blocks))
    .map((b) => `${b.weekday}:${b.startMinute}-${b.endMinute}:${b.note ?? ""}`)
    .join("|");
}

// ── Painting ─────────────────────────────────────────────────────────────

export interface CellRef {
  weekday: number;
  minute: number;
}

/**
 * The cells of the rectangle a drag from `a` to `b` sweeps out, across the
 * `days` shown (so a drag from Monday to Wednesday skips nothing, and a drag
 * over a hidden weekend does not paint it).
 */
export function rectangle(a: CellRef, b: CellRef, days: readonly number[]): string[] {
  const ia = days.indexOf(a.weekday);
  const ib = days.indexOf(b.weekday);
  if (ia < 0 || ib < 0) return [];
  const [d0, d1] = ia <= ib ? [ia, ib] : [ib, ia];
  const [m0, m1] = a.minute <= b.minute ? [a.minute, b.minute] : [b.minute, a.minute];
  const keys: string[] = [];
  for (let d = d0; d <= d1; d++) {
    for (let m = m0; m <= m1; m += SLOT_MINUTES) keys.push(cellKey(days[d], m));
  }
  return keys;
}

export type PaintMode = "paint" | "erase";

/** The mode a drag takes from the cell it starts on: paint a free cell, erase a marked one. */
export const modeFor = (cells: Cells, key: string): PaintMode => (cells.has(key) ? "erase" : "paint");

/**
 * `cells` with `keys` painted or erased. Painting keeps the note of a cell that
 * was already marked; a newly painted cell takes the note of a marked cell
 * directly above or below it (so stretching a "Lecture" keeps it one block),
 * else none.
 */
export function applyPaint(cells: Cells, keys: readonly string[], mode: PaintMode): Map<string, string | null> {
  const next = new Map(cells);
  if (mode === "erase") {
    for (const key of keys) next.delete(key);
    return next;
  }
  const fresh = keys.filter((key) => !next.has(key));
  for (const key of fresh) next.set(key, null);
  // Inherit a neighbour's note, walking outward from the old cells so a long
  // stroke picks it up all the way along.
  const freshSet = new Set(fresh);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of fresh) {
      if (next.get(key) !== null) continue;
      const { weekday, minute } = parseCellKey(key);
      for (const neighbour of [cellKey(weekday, minute - SLOT_MINUTES), cellKey(weekday, minute + SLOT_MINUTES)]) {
        const note = next.get(neighbour);
        if (note && (freshSet.has(neighbour) || cells.has(neighbour))) {
          next.set(key, note);
          changed = true;
          break;
        }
      }
    }
  }
  return next;
}

/** The block (run of same-note cells) a marked cell belongs to, or null if the cell is free. */
export function runAt(cells: Cells, weekday: number, minute: number): BlockInput | null {
  const key = cellKey(weekday, minute);
  if (!cells.has(key)) return null;
  const note = cleanNote(cells.get(key));
  const same = (m: number) => cells.has(cellKey(weekday, m)) && cleanNote(cells.get(cellKey(weekday, m))) === note;
  let start = minute;
  while (same(start - SLOT_MINUTES)) start -= SLOT_MINUTES;
  let end = minute + SLOT_MINUTES;
  while (same(end)) end += SLOT_MINUTES;
  return { weekday, startMinute: start, endMinute: end, note };
}

/** `cells` with every marked cell of `weekday` in [start, end) given `note`. */
export function setNote(cells: Cells, block: Pick<BlockInput, "weekday" | "startMinute" | "endMinute">, note: string | null): Map<string, string | null> {
  const next = new Map(cells);
  for (const key of next.keys()) {
    const cell = parseCellKey(key);
    if (cell.weekday === block.weekday && cell.minute >= block.startMinute && cell.minute < block.endMinute) {
      next.set(key, cleanNote(note));
    }
  }
  return next;
}

/** Whether any marked cell falls outside the `days` and `range` shown. */
export function hasCellsOutside(cells: Cells, days: readonly number[], range: MinuteRange): boolean {
  for (const key of cells.keys()) {
    const { weekday, minute } = parseCellKey(key);
    if (!days.includes(weekday) || minute < range.start || minute >= range.end) return true;
  }
  return false;
}

// ── The committee, combined ──────────────────────────────────────────────

export interface Absence {
  memberId: string;
  note: string | null;
}

/**
 * Who is unavailable in each cell, for the `memberIds` being looked at.
 * Keyed like `Cells`; a cell nobody is out of is absent from the map. Within a
 * cell, absences follow the order of `memberIds`.
 */
export function overlay(blocks: readonly AvailabilityBlock[], memberIds: readonly string[]): Map<string, Absence[]> {
  const order = new Map(memberIds.map((id, i) => [id, i]));
  const out = new Map<string, Absence[]>();
  for (const block of blocks) {
    if (!order.has(block.memberId)) continue;
    const from = Math.floor(block.startMinute / SLOT_MINUTES) * SLOT_MINUTES;
    for (let m = from; m < block.endMinute; m += SLOT_MINUTES) {
      const key = cellKey(block.weekday, m);
      const list = out.get(key) ?? [];
      const existing = list.find((a) => a.memberId === block.memberId);
      if (existing) existing.note ??= cleanNote(block.note);
      else list.push({ memberId: block.memberId, note: cleanNote(block.note) });
      out.set(key, list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => order.get(a.memberId)! - order.get(b.memberId)!);
  return out;
}

export interface Span {
  weekday: number;
  startMinute: number;
  endMinute: number;
  /** Who is unavailable for the whole span, in `memberIds` order. Empty: everyone free. */
  absent: Absence[];
}

const absentSignature = (list: readonly Absence[] | undefined) => (list ?? []).map((a) => `${a.memberId}:${a.note ?? ""}`).join(",");

/**
 * One day of the overlay as spans: runs of cells where exactly the same people
 * (with the same notes) are out. The phone's per-day list.
 */
export function daySpans(cells: ReadonlyMap<string, Absence[]>, weekday: number, range: MinuteRange): Span[] {
  const spans: Span[] = [];
  for (const minute of slotsIn(range)) {
    const absent = cells.get(cellKey(weekday, minute)) ?? [];
    const last = spans.at(-1);
    if (last && absentSignature(last.absent) === absentSignature(absent)) last.endMinute = minute + SLOT_MINUTES;
    else spans.push({ weekday, startMinute: minute, endMinute: minute + SLOT_MINUTES, absent: [...absent] });
  }
  return spans;
}

/** At least this long to count as a slot to meet in. */
export const MEETING_MINUTES = 60;

/**
 * The cells inside an "everyone free" run of at least `minMinutes`: for the
 * emerald tint on the combined grid.
 */
export function everyoneFreeCells(
  cells: ReadonlyMap<string, Absence[]>,
  days: readonly number[],
  range: MinuteRange,
  minMinutes: number = MEETING_MINUTES,
): Set<string> {
  const out = new Set<string>();
  for (const weekday of days) {
    let run: number[] = [];
    const flush = () => {
      if (run.length * SLOT_MINUTES >= minMinutes) for (const m of run) out.add(cellKey(weekday, m));
      run = [];
    };
    for (const minute of slotsIn(range)) {
      if ((cells.get(cellKey(weekday, minute))?.length ?? 0) === 0) run.push(minute);
      else flush();
    }
    flush();
  }
  return out;
}

export interface MeetingSlot {
  weekday: number;
  startMinute: number;
  endMinute: number;
  /** Free for the whole slot, in `memberIds` order. */
  free: string[];
  /** Out for some or all of it. */
  absent: string[];
}

/**
 * The best times for the committee to meet: the longest stretches, at least
 * `minMinutes` long, in which the most of `memberIds` are free for the whole
 * stretch. Each is a maximal run of cells in which the same people are free,
 * so the list never offers two overlapping versions of the same gap.
 *
 * Ranked by how many are free, then by length, then by day and time. Stretches
 * with nobody free are never offered.
 */
export function bestMeetingSlots(
  blocks: readonly AvailabilityBlock[],
  memberIds: readonly string[],
  days: readonly number[],
  range: MinuteRange,
  { minMinutes = MEETING_MINUTES, limit = 5 }: { minMinutes?: number; limit?: number } = {},
): MeetingSlot[] {
  if (!memberIds.length) return [];
  const cells = overlay(blocks, memberIds);
  const candidates: MeetingSlot[] = [];
  const keep = (slot: MeetingSlot) => slot.free.length > 0 && slot.endMinute - slot.startMinute >= minMinutes;
  for (const weekday of days) {
    const runs: MeetingSlot[] = [];
    for (const minute of slotsIn(range)) {
      const out = new Set((cells.get(cellKey(weekday, minute)) ?? []).map((a) => a.memberId));
      const free = memberIds.filter((id) => !out.has(id));
      const last = runs.at(-1);
      if (last && last.free.join() === free.join()) last.endMinute = minute + SLOT_MINUTES;
      else runs.push({ weekday, startMinute: minute, endMinute: minute + SLOT_MINUTES, free, absent: memberIds.filter((id) => out.has(id)) });
    }
    candidates.push(...runs.filter(keep));
  }
  return candidates
    .sort(
      (a, b) =>
        b.free.length - a.free.length ||
        b.endMinute - b.startMinute - (a.endMinute - a.startMinute) ||
        a.weekday - b.weekday ||
        a.startMinute - b.startMinute,
    )
    .slice(0, limit);
}
