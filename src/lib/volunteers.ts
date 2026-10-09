import { isDayKey } from "@/lib/planTime";

/**
 * The volunteer register (/volunteer): its options and the checks on a
 * sign-up. Pure, so the form, the route and the committee's table share it.
 *
 * The keys are what's stored; change a label freely, but renaming a key
 * strands the rows that already have it.
 */

export const COMMITMENTS = [
  { key: "one_off", label: "A one-off or two" },
  { key: "monthly", label: "About once a month" },
  { key: "fortnightly", label: "Every couple of weeks" },
  { key: "weekly", label: "Every week" },
  { key: "lots", label: "Several times a week" },
] as const;

/**
 * What the form asked before volunteers picked a date: kept to label the rows
 * that answered it.
 */
export const PERIODS = [
  { key: "term1", label: "Term 1 (Sep–Dec)" },
  { key: "winter", label: "Winter break" },
  { key: "term2", label: "Term 2 (Jan–Mar)" },
  { key: "spring", label: "Spring break" },
  { key: "term3", label: "Term 3 (Apr–Jun)" },
  { key: "summer", label: "Summer" },
] as const;

export const INTERESTS = [
  { key: "food", label: "Food rescue and Zero Food Waste" },
  { key: "homelessness", label: "Homelessness and outreach" },
  { key: "environment", label: "Environment and gardening" },
  { key: "education", label: "Tutoring and mentoring" },
  { key: "elderly", label: "Befriending older people" },
  { key: "refugees", label: "Refugees and asylum seekers" },
  { key: "health", label: "Health and wellbeing" },
  { key: "animals", label: "Animals" },
  { key: "events", label: "Running events and fundraising" },
  { key: "creative", label: "Design, social media and comms" },
] as const;

export type Commitment = (typeof COMMITMENTS)[number]["key"];

export const labelOf = (options: readonly { key: string; label: string }[], key: string) =>
  options.find((o) => o.key === key)?.label ?? key;

// ── Free times ───────────────────────────────────────────────────────────

/**
 * A stretch of a typical week someone is free: ISO weekday (Mon = 1) and
 * minutes after midnight, on the grid's half-hours.
 */
export interface FreeBlock {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export const FREE_STEP = 30;
/** The hours the grid shows. */
export const FREE_RANGE = { start: 8 * 60, end: 22 * 60 } as const;

const DAY_MINUTES = 24 * 60;

/** The half-hours a set of blocks covers, as "weekday:minute". */
export function freeCells(blocks: readonly FreeBlock[]): Set<string> {
  const cells = new Set<string>();
  for (const b of blocks) {
    for (let m = Math.floor(b.startMinute / FREE_STEP) * FREE_STEP; m < b.endMinute; m += FREE_STEP) cells.add(`${b.weekday}:${m}`);
  }
  return cells;
}

/** Half-hours back into blocks, by day then time, touching ones joined. */
export function freeBlocks(cells: Iterable<string>): FreeBlock[] {
  const sorted = [...cells]
    .map((key) => key.split(":").map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const blocks: FreeBlock[] = [];
  for (const [weekday, minute] of sorted) {
    const last = blocks.at(-1);
    if (last && last.weekday === weekday && last.endMinute === minute) last.endMinute += FREE_STEP;
    else blocks.push({ weekday, startMinute: minute, endMinute: minute + FREE_STEP });
  }
  return blocks;
}

/** Whether someone is free for the half-hour starting at `minute` on `weekday`. */
export const isFreeAt = (blocks: readonly FreeBlock[], weekday: number, minute: number) =>
  blocks.some((b) => b.weekday === weekday && b.startMinute <= minute && minute < b.endMinute);

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const weekdayShort = (weekday: number) => WEEKDAY_SHORT[weekday - 1] ?? "?";

const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** "Mon 10:00–13:00, 18:00–20:00", one string per day. */
export function freeSummary(blocks: readonly FreeBlock[]): string[] {
  const days = new Map<number, string[]>();
  for (const b of freeBlocks(freeCells(blocks))) {
    days.set(b.weekday, [...(days.get(b.weekday) ?? []), `${clock(b.startMinute)}–${clock(b.endMinute)}`]);
  }
  return [...days].map(([weekday, spans]) => `${weekdayShort(weekday)} ${spans.join(", ")}`);
}

/** Free blocks from a request: on the grid, inside the week, overlaps joined. */
function parseFreeTimes(value: unknown): FreeBlock[] {
  if (!Array.isArray(value)) return [];
  const cells = new Set<string>();
  for (const item of value.slice(0, 7 * 48)) {
    const { weekday, startMinute, endMinute } = (item ?? {}) as Record<string, unknown>;
    if (![weekday, startMinute, endMinute].every(Number.isInteger)) continue;
    const [d, s, e] = [weekday, startMinute, endMinute] as number[];
    if (d < 1 || d > 7 || s < 0 || e > DAY_MINUTES || s >= e || s % FREE_STEP || e % FREE_STEP) continue;
    for (const key of freeCells([{ weekday: d, startMinute: s, endMinute: e }])) cells.add(key);
  }
  return freeBlocks(cells);
}

// ── Until when ───────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Jun 2027" from "2027-06-14". */
export function untilLabel(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

/** A sign-up's answers; who signed up comes from their UCL sign-in, not the form. */
export interface VolunteerInput {
  study: string | null;
  commitment: Commitment;
  free_times: FreeBlock[];
  /** The last day they're around to help, "YYYY-MM-DD", or null for no end in mind. */
  available_until: string | null;
  interests: string[];
  notes: string | null;
}

export interface Volunteer extends VolunteerInput {
  /** From before the date picker: terms and breaks they ticked. */
  periods: string[];
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export const VOLUNTEER_COLUMNS = 
  "id,name,email,study,commitment,free_times,available_until,periods,interests,notes,created_at,updated_at";

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/** Known keys only, each once, in the options' order. */
function pick(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set(value.filter((v): v is string => typeof v === "string"));
  return allowed.filter((k) => chosen.has(k));
}

/**
 * A sign-up from the form, cleaned, or what's wrong with it in the form's
 * voice. `today` (London, "YYYY-MM-DD") is the earliest "until" allowed.
 */
export function parseVolunteer(
  body: unknown,
  today: string,
): { value: VolunteerInput; error?: undefined } | { value?: undefined; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const commitment = COMMITMENTS.find((c) => c.key === b.commitment)?.key;

  if (!commitment) return { error: "Pick how often you could help" };
  let until: string | null = null;
  if (b.available_until !== undefined && b.available_until !== null && b.available_until !== "") {
    if (!isDayKey(b.available_until)) return { error: "That date doesn't look right, pick it from the calendar" };
    if (b.available_until < today) return { error: "Pick a date from today onwards for how long you're around" };
    until = b.available_until;
  }
  if (b.consent !== true) return { error: "Tick the box so we can keep your details and get in touch" };

  return {
    value: {
      study: str(b.study, 120),
      commitment,
      free_times: parseFreeTimes(b.free_times),
      available_until: until,
      interests: pick(b.interests, INTERESTS.map((i) => i.key)),
      notes: str(b.notes, 1000),
    },
  };
}
