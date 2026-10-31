import { entryPlace, matchesFilter, sessionLabel, type DirectoryEntry, type DirectoryFilter, EMPTY_FILTER } from "@/lib/directory";
import type { CommunityEvent, CommunitySociety } from "@/lib/communityEvents";
import { placeKey, type Point } from "@/lib/placeKey";

/**
 * /opportunities: volunteering in London, from every source we have — the
 * committee's directory of places (filled in by hand or read off each
 * organisation's own page) and the events on the volunteering calendar, which
 * the sync pulls from the Toolbox and the societies' feeds — as one list the
 * cards and the map both draw from. Pure, so the browser filters it.
 */

export type LondonKind = "place" | "event";

export type LondonItem =
  | {
      kind: "place";
      id: string;
      title: string;
      host: string;
      location: string | null;
      /** The key into the places the map knows, or null for no pin. */
      place: string | null;
      href: string;
      external: false;
      entry: DirectoryEntry;
    }
  | {
      kind: "event";
      id: string;
      title: string;
      host: string;
      location: string | null;
      place: string | null;
      href: string;
      external: boolean;
      startsAt: string;
      endsAt: string;
      allDay: boolean;
      colour: string | null;
    };

/** How far ahead the list looks for events. The calendar has the rest. */
export const EVENT_DAYS = 28;

export function placeItems(entries: readonly DirectoryEntry[]): LondonItem[] {
  return entries.map((e) => {
    // Where it is, else where its first session is.
    const where = entryPlace(e) ?? e.sessions.find((s) => s.where)?.where ?? null;
    return {
      kind: "place" as const,
      id: `place:${e.id}`,
      title: e.title,
      host: e.organisation,
      location: where,
      place: placeKey(where),
      href: `/opportunities/${e.slug}`,
      external: false as const,
      entry: e,
    };
  });
}

/** Events that haven't ended by `now` and start within `days`, soonest first; cancelled ones left out. */
export function upcomingEvents(
  events: readonly CommunityEvent[],
  societies: readonly CommunitySociety[],
  now: Date,
  days: number = EVENT_DAYS,
): LondonItem[] {
  const until = now.getTime() + days * 86_400_000;
  const byId = new Map(societies.map((s) => [s.id, s]));
  return events
    .filter((e) => !e.cancelled && Date.parse(e.endsAt) > now.getTime() && Date.parse(e.startsAt) < until)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((e) => ({
      kind: "event" as const,
      id: `event:${e.id}`,
      title: e.title,
      host: byId.get(e.societyId)?.name ?? "",
      location: e.location,
      place: placeKey(e.location),
      href: e.url,
      external: !e.url.includes("uclvolunteering.org"),
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      colour: byId.get(e.societyId)?.colour ?? null,
    }));
}

export interface LondonFilter extends DirectoryFilter {
  kind: "" | LondonKind;
}

export const NO_LONDON_FILTER: LondonFilter = { ...EMPTY_FILTER, kind: "" };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const londonWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/London" });
const WEEKDAY_NUMBER: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/**
 * Whether an item passes the filters. Places use the directory's own rules.
 * Cause, drop-in, DBS and remote only describe places, so asking for any of
 * them leaves events out rather than guessing; "free on" keeps events on
 * that weekday.
 */
export function matchesLondon(item: LondonItem, f: LondonFilter): boolean {
  if (f.kind && item.kind !== f.kind) return false;
  if (item.kind === "place") return matchesFilter(item.entry, f);
  if (f.cause || f.dropIn || f.noDbs || f.remote) return false;
  if (f.day && WEEKDAY_NUMBER[londonWeekday.format(new Date(item.startsAt))] !== f.day) return false;
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = fold(`${item.title} ${item.host} ${item.location ?? ""}`);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** Items that share a spot, so one pin lists everything there. */
export function groupByPoint<T extends { place: string | null }>(items: readonly T[], places: Record<string, Point>): { key: string; point: Point; items: T[] }[] {
  const groups = new Map<string, { key: string; point: Point; items: T[] }>();
  for (const item of items) {
    const point = item.place ? places[item.place] : undefined;
    if (!point) continue;
    // Two names for one building share a pin.
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
    const group = groups.get(key) ?? { key, point, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** "Tue 18:00–20:00 · Sat 10:00–13:00", or null for a place with no fixed times. */
export function placeWhen(e: Pick<DirectoryEntry, "sessions">): string | null {
  return e.sessions.length ? e.sessions.map(sessionLabel).join(" · ") : null;
}
