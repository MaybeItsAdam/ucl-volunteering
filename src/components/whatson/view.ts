import { londonDayKey, mondayOf, shiftDayKey, startOfLondonDay } from "@/lib/planTime";
import { DEFAULT_VOLSOC_ORGANISER_ID } from "@/lib/toolboxEvents";
import { dayLabel } from "@/components/plan/format";

/** What's on's filters and grouping. Pure. */

export const RANGES = ["week", "month", "all"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_LABELS: Record<Range, string> = {
  week: "This week",
  month: "Next 30 days",
  all: "All",
};

export const DEFAULT_RANGE: Range = "month";

export function parseRange(value: string | undefined): Range {
  return RANGES.includes(value as Range) ? (value as Range) : DEFAULT_RANGE;
}

/** The `s` parameter, "id,id", as the ids it names that are known, in the known order. */
export function parseSocieties(value: string | undefined, known: readonly string[]): string[] {
  const asked = new Set((value ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  return known.filter((id) => asked.has(id));
}

/** Events starting before this are in the range; null for no limit. */
export function rangeEnd(range: Range, now: Date): Date | null {
  const today = londonDayKey(now);
  if (range === "week") return startOfLondonDay(shiftDayKey(mondayOf(today), 7));
  if (range === "month") return startOfLondonDay(shiftDayKey(today, 30));
  return null;
}

/** The link for a filter state on the page at `base`, leaving defaults out of the URL. */
export function whatsOnHref(range: Range, societies: readonly string[], base: string = "/portal/whats-on"): string {
  const params = new URLSearchParams();
  if (range !== DEFAULT_RANGE) params.set("range", range);
  if (societies.length) params.set("s", societies.join(","));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** `selected` with `id` added, or taken out if it was there, in the known order. */
export function toggleSociety(selected: readonly string[], id: string, known: readonly string[]): string[] {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return known.filter((k) => next.has(k));
}

interface Timed {
  societyId: string;
  startsAt: string;
  endsAt: string;
}

/** Events in the range and from the chosen societies (all, if none are chosen). */
export function filterEvents<T extends Timed>(events: T[], range: Range, societies: readonly string[], now: Date): T[] {
  const end = rangeEnd(range, now)?.getTime() ?? Infinity;
  const chosen = new Set(societies);
  return events.filter(
    (e) => Date.parse(e.endsAt) >= now.getTime() && Date.parse(e.startsAt) < end && (!chosen.size || chosen.has(e.societyId)),
  );
}

/**
 * A society's name as the page shows it: the SU's trailing "Society" goes, as
 * every one has it, but VolSoc keeps its full name.
 */
export function societyLabel(name: string, id: string, volsocId: string = DEFAULT_VOLSOC_ORGANISER_ID): string {
  if (id === volsocId) return "UCL Volunteering Society";
  return name.replace(/\s+Society$/i, "").trim() || name;
}

/** "Today", "Tomorrow", else "Wed 30 Sep". */
export function dayHeading(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === shiftDayKey(today, 1)) return "Tomorrow";
  return dayLabel(key);
}

export interface DayGroup<T> {
  key: string;
  heading: string;
  events: T[];
}

/**
 * Events by the London day they start, in time order. One already running
 * since an earlier day is listed under today.
 */
export function groupByDay<T extends Timed>(events: T[], now: Date): DayGroup<T>[] {
  const today = londonDayKey(now);
  const groups = new Map<string, T[]>();
  const sorted = [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const event of sorted) {
    const start = londonDayKey(new Date(event.startsAt));
    const key = start < today ? today : start;
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({ key, heading: dayHeading(key, today), events: list }));
}
