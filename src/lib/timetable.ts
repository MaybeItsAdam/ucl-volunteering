import { entryPlace, labelOf, SIGNUP_METHODS, type Cause, type DbsOption, type DirectoryEntry } from "@/lib/directory";
import type { CommunityEvent, CommunitySociety } from "@/lib/communityEvents";
import { placeKey, type Point } from "@/lib/placeKey";
import { londonDateAt, londonMinuteOfDay, shiftDayKey } from "@/lib/planTime";

/**
 * /timetable: everything on in a week — the directory's regular sessions and
 * drop-ins, and every event on the volunteering calendar — as one list the
 * grid and the map both draw from. Pure, so the browser can move between
 * weeks without asking the server again.
 */

export type ItemKind = "session" | "event";

export interface TimetableItem {
  /** Unique within a week: a session's id carries its day. */
  id: string;
  kind: ItemKind;
  title: string;
  /** The organisation or society running it. */
  host: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  /** The key into the places the map knows, or null for no pin. */
  place: string | null;
  /** Where "More" goes: the directory page, or the event's own page. */
  href: string;
  external: boolean;
  causes: Cause[];
  dbs: DbsOption | null;
  /** Turn up without signing up first. */
  dropIn: boolean;
  /** "Just turn up", "Apply online"…, for sessions. */
  signup: string | null;
  note: string | null;
  /** A society's own colour, for events. */
  colour: string | null;
}

/** The directory's sessions that fall in the week starting `monday`, as dated items. */
export function sessionItems(entries: readonly DirectoryEntry[], monday: string): TimetableItem[] {
  const out: TimetableItem[] = [];
  for (const e of entries) {
    for (const s of e.sessions) {
      const day = shiftDayKey(monday, s.weekday - 1);
      const toMinute = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      const where = s.where ?? entryPlace(e);
      out.push({
        id: `${e.id}:${day}:${s.start}`,
        kind: "session",
        title: e.title,
        host: e.organisation,
        startsAt: londonDateAt(day, toMinute(s.start)).toISOString(),
        endsAt: londonDateAt(day, toMinute(s.end)).toISOString(),
        allDay: false,
        location: where,
        place: placeKey(where),
        href: `/opportunities/${e.slug}`,
        external: false,
        causes: e.causes,
        dbs: e.dbs,
        dropIn: e.commitment === "drop_in" || e.signupMethod === "just_turn_up",
        signup: labelOf(SIGNUP_METHODS, e.signupMethod),
        note: s.note,
        colour: null,
      });
    }
  }
  return out;
}

/** Events overlapping the week starting `monday` (London days), cancelled ones left out. */
export function eventItems(events: readonly CommunityEvent[], societies: readonly CommunitySociety[], monday: string): TimetableItem[] {
  const start = londonDateAt(monday, 0).getTime();
  const end = londonDateAt(shiftDayKey(monday, 7), 0).getTime();
  const byId = new Map(societies.map((s) => [s.id, s]));
  return events
    .filter((e) => !e.cancelled && Date.parse(e.startsAt) < end && Date.parse(e.endsAt) > start)
    .map((e) => ({
      id: e.id,
      kind: "event" as const,
      title: e.title,
      host: byId.get(e.societyId)?.name ?? "",
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      location: e.location,
      place: placeKey(e.location),
      href: e.url,
      external: !e.url.includes("uclvolunteering.org"),
      causes: [],
      dbs: null,
      dropIn: false,
      signup: null,
      note: null,
      colour: byId.get(e.societyId)?.colour ?? null,
    }));
}

export type TimeOfDay = "" | "morning" | "afternoon" | "evening";

export interface TimetableFilter {
  q: string;
  kind: "" | ItemKind;
  cause: Cause | "";
  host: string;
  time: TimeOfDay;
  dropIn: boolean;
  noDbs: boolean;
}

export const NO_FILTER: TimetableFilter = { q: "", kind: "", cause: "", host: "", time: "", dropIn: false, noDbs: false };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Morning before 12:00, afternoon to 17:00, evening after; by start time. All-day things fit any. */
export function timeOfDay(item: Pick<TimetableItem, "startsAt" | "allDay">): TimeOfDay {
  if (item.allDay) return "";
  const m = londonMinuteOfDay(new Date(item.startsAt));
  return m < 12 * 60 ? "morning" : m < 17 * 60 ? "afternoon" : "evening";
}

/**
 * Whether an item passes the filters. Causes and DBS only describe directory
 * sessions, so filtering on them leaves events out rather than guessing.
 */
export function matchesTimetable(item: TimetableItem, f: TimetableFilter): boolean {
  if (f.kind && item.kind !== f.kind) return false;
  if (f.host && item.host !== f.host) return false;
  if (f.cause && !item.causes.includes(f.cause)) return false;
  if (f.noDbs && (item.kind === "event" || item.dbs === "needed")) return false;
  if (f.dropIn && !item.dropIn) return false;
  if (f.time) {
    const t = timeOfDay(item);
    if (t && t !== f.time) return false;
  }
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = fold(`${item.title} ${item.host} ${item.location ?? ""}`);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** Items that share a pin, so one marker lists everything at that place. */
export function groupByPlace(items: readonly TimetableItem[], places: Record<string, Point>): { key: string; point: Point; items: TimetableItem[] }[] {
  const groups = new Map<string, { key: string; point: Point; items: TimetableItem[] }>();
  for (const item of items) {
    const point = item.place ? places[item.place] : undefined;
    if (!point) continue;
    // Pins at the same spot (two names for one building) share a marker.
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
    const group = groups.get(key) ?? { key, point, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}
