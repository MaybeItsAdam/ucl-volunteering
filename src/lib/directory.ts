/**
 * The volunteering directory (/opportunities): places students can volunteer
 * in London, curated by the committee, with the practical things the big
 * listing sites bury — how to sign up, when the drop-ins are, what you need
 * (DBS, age), and where — on the card itself.
 *
 * Pure, so the public page, the committee's editor and the routes share it.
 * Option keys are stored; change a label freely, but renaming a key strands
 * the rows that have it.
 */

export const CAUSES = [
  { key: "homelessness", label: "Homelessness" },
  { key: "food", label: "Food and hunger" },
  { key: "environment", label: "Environment and gardening" },
  { key: "education", label: "Tutoring and mentoring" },
  { key: "children", label: "Children and young people" },
  { key: "elderly", label: "Older people" },
  { key: "refugees", label: "Refugees and asylum seekers" },
  { key: "health", label: "Health and hospitals" },
  { key: "mental_health", label: "Mental health" },
  { key: "disability", label: "Disability" },
  { key: "animals", label: "Animals" },
  { key: "arts", label: "Arts and heritage" },
  { key: "community", label: "Community" },
] as const;

export const COMMITMENT_KINDS = [
  { key: "drop_in", label: "Drop in", hint: "Turn up to a session, no sign-up beforehand" },
  { key: "one_off", label: "One-off", hint: "A single day or event" },
  { key: "regular", label: "Regular", hint: "The same slot each week or fortnight" },
  { key: "flexible", label: "Flexible", hint: "Agree your times with them" },
] as const;

export const SIGNUP_METHODS = [
  { key: "just_turn_up", label: "Just turn up" },
  { key: "online_form", label: "Apply online" },
  { key: "email", label: "Email them" },
  { key: "through_volsoc", label: "Sign up through VolSoc" },
  { key: "induction", label: "Book an induction" },
] as const;

export const DBS_OPTIONS = [
  { key: "not_needed", label: "No DBS needed" },
  { key: "provided", label: "DBS needed, they arrange it free" },
  { key: "needed", label: "DBS needed" },
] as const;

export type Cause = (typeof CAUSES)[number]["key"];
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number]["key"];
export type SignupMethod = (typeof SIGNUP_METHODS)[number]["key"];
export type DbsOption = (typeof DBS_OPTIONS)[number]["key"];

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** A regular session: ISO weekday (Mon = 1), London wall times "HH:MM". */
export interface Session {
  weekday: number;
  start: string;
  end: string;
  /** Where, if not the main address. */
  where: string | null;
  /** e.g. "Term time only", "Drop-in, arrive by 10:15". */
  note: string | null;
}

export interface DirectoryEntry {
  id: string;
  slug: string;
  organisation: string;
  orgUrl: string | null;
  title: string;
  summary: string;
  description: string | null;
  causes: Cause[];
  commitment: CommitmentKind;
  /** In words: "3 hours a week", "One Saturday morning". */
  timeNeeded: string | null;
  signupMethod: SignupMethod;
  signupUrl: string | null;
  signupEmail: string | null;
  /** What actually happens after you get in touch: "Email Sam, then a 20-minute induction call". */
  signupSteps: string | null;
  sessions: Session[];
  address: string | null;
  postcode: string | null;
  nearestStation: string | null;
  remote: boolean;
  minAge: number | null;
  dbs: DbsOption;
  expensesPaid: boolean;
  training: string | null;
  accessibility: string | null;
  contactName: string | null;
  contactEmail: string | null;
  /** The last London day someone on the committee checked this was still right. */
  verifiedOn: string | null;
  active: boolean;
  updatedAt: string;
}

export const DIRECTORY_COLUMNS =
  "id,slug,organisation,org_url,title,summary,description,causes,commitment,time_needed,signup_method,signup_url,signup_email,signup_steps,sessions,address,postcode,nearest_station,remote,min_age,dbs,expenses_paid,training,accessibility,contact_name,contact_email,verified_on,active,updated_at";

export interface DirectoryRow {
  id: string;
  slug: string;
  organisation: string;
  org_url: string | null;
  title: string;
  summary: string;
  description: string | null;
  causes: string[];
  commitment: string;
  time_needed: string | null;
  signup_method: string;
  signup_url: string | null;
  signup_email: string | null;
  signup_steps: string | null;
  sessions: unknown;
  address: string | null;
  postcode: string | null;
  nearest_station: string | null;
  remote: boolean;
  min_age: number | null;
  dbs: string;
  expenses_paid: boolean;
  training: string | null;
  accessibility: string | null;
  contact_name: string | null;
  contact_email: string | null;
  verified_on: string | null;
  active: boolean;
  updated_at: string;
}

const keysOf = (options: readonly { key: string }[]) => new Set(options.map((o) => o.key));
const CAUSE_KEYS = keysOf(CAUSES);
const COMMITMENT_KEYS = keysOf(COMMITMENT_KINDS);
const SIGNUP_KEYS = keysOf(SIGNUP_METHODS);
const DBS_KEYS = keysOf(DBS_OPTIONS);

export const labelOf = (options: readonly { key: string; label: string }[], key: string) =>
  options.find((o) => o.key === key)?.label ?? key;

/** A row as the pages use it; unknown option keys fall back rather than throw. */
export function fromRow(row: DirectoryRow): DirectoryEntry {
  return {
    id: row.id,
    slug: row.slug,
    organisation: row.organisation,
    orgUrl: row.org_url,
    title: row.title,
    summary: row.summary,
    description: row.description,
    causes: (row.causes ?? []).filter((c): c is Cause => CAUSE_KEYS.has(c)),
    commitment: (COMMITMENT_KEYS.has(row.commitment) ? row.commitment : "flexible") as CommitmentKind,
    timeNeeded: row.time_needed,
    signupMethod: (SIGNUP_KEYS.has(row.signup_method) ? row.signup_method : "email") as SignupMethod,
    signupUrl: row.signup_url,
    signupEmail: row.signup_email,
    signupSteps: row.signup_steps,
    sessions: parseSessions(row.sessions).value ?? [],
    address: row.address,
    postcode: row.postcode,
    nearestStation: row.nearest_station,
    remote: row.remote,
    minAge: row.min_age,
    dbs: (DBS_KEYS.has(row.dbs) ? row.dbs : "not_needed") as DbsOption,
    expensesPaid: row.expenses_paid,
    training: row.training,
    accessibility: row.accessibility,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    verifiedOn: row.verified_on,
    active: row.active,
    updatedAt: row.updated_at,
  };
}

// ── Checking what the committee typed ──────────────────────────────────────

type Result<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function url(value: unknown): Result<string | null> {
  const t = text(value, 2000);
  if (!t) return { value: null };
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? { value: u.toString() } : { error: "Links must start with https://" };
  } catch {
    return { error: `"${t.slice(0, 40)}" isn't a link` };
  }
}

/** The sessions list, each checked; times are "HH:MM" with the end after the start. */
export function parseSessions(value: unknown): Result<Session[]> {
  if (value == null) return { value: [] };
  if (!Array.isArray(value)) return { error: "Sessions must be a list" };
  if (value.length > 14) return { error: "Up to 14 sessions" };
  const out: Session[] = [];
  for (const raw of value) {
    const s = raw as Partial<Record<keyof Session, unknown>>;
    const weekday = Number(s?.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return { error: "Each session needs a day" };
    if (typeof s.start !== "string" || !TIME.test(s.start) || typeof s.end !== "string" || !TIME.test(s.end)) {
      return { error: "Session times look like 10:00" };
    }
    if (s.end <= s.start) return { error: `The ${WEEKDAYS[weekday - 1]} session ends before it starts` };
    out.push({ weekday, start: s.start, end: s.end, where: text(s.where, 120), note: text(s.note, 120) });
  }
  out.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  return { value: out };
}

/** URL-safe and readable: "Crisis Skylight · Kitchen volunteer" → "crisis-skylight-kitchen-volunteer". */
export function slugify(...parts: string[]): string {
  return (
    parts
      .join(" ")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "opportunity"
  );
}

/** The database row for an entry the committee saved, or what's wrong with it. */
export function parseEntry(body: unknown): Result<Omit<DirectoryRow, "id" | "slug" | "updated_at" | "verified_on">> {
  if (!body || typeof body !== "object") return { error: "Send the entry as JSON" };
  const b = body as Record<string, unknown>;

  const organisation = text(b.organisation, 120);
  if (!organisation) return { error: "Which organisation is it?" };
  const title = text(b.title, 120);
  if (!title) return { error: "Give the role a title" };
  const summary = text(b.summary, 200);
  if (!summary) return { error: "Add a one-line summary" };

  const causes = Array.isArray(b.causes) ? [...new Set(b.causes.filter((c): c is string => typeof c === "string"))] : [];
  if (causes.some((c) => !CAUSE_KEYS.has(c))) return { error: "Unknown cause" };
  if (typeof b.commitment !== "string" || !COMMITMENT_KEYS.has(b.commitment)) return { error: "Pick what kind of commitment it is" };
  if (typeof b.signupMethod !== "string" || !SIGNUP_KEYS.has(b.signupMethod)) return { error: "Say how people sign up" };
  if (typeof b.dbs !== "string" || !DBS_KEYS.has(b.dbs)) return { error: "Say whether a DBS check is needed" };

  const orgUrl = url(b.orgUrl);
  if (orgUrl.error) return { error: orgUrl.error };
  const signupUrl = url(b.signupUrl);
  if (signupUrl.error) return { error: signupUrl.error };
  if (b.signupMethod === "online_form" && !signupUrl.value) return { error: "Add the link to the sign-up form" };

  const signupEmail = text(b.signupEmail, 200);
  if (signupEmail && !EMAIL.test(signupEmail)) return { error: "That sign-up email doesn't look right" };
  if (b.signupMethod === "email" && !signupEmail) return { error: "Add the email address to write to" };
  const contactEmail = text(b.contactEmail, 200);
  if (contactEmail && !EMAIL.test(contactEmail)) return { error: "That contact email doesn't look right" };

  const postcode = text(b.postcode, 10)?.toUpperCase() ?? null;
  if (postcode && !POSTCODE.test(postcode)) return { error: "That postcode doesn't look right" };

  let minAge: number | null = null;
  if (b.minAge !== null && b.minAge !== undefined && b.minAge !== "") {
    minAge = Number(b.minAge);
    if (!Number.isInteger(minAge) || minAge < 0 || minAge > 99) return { error: "Minimum age is a whole number" };
  }

  const sessions = parseSessions(b.sessions);
  if (sessions.error !== undefined) return { error: sessions.error };
  if (b.commitment === "drop_in" && sessions.value.length === 0) return { error: "A drop-in needs at least one session time" };

  return {
    value: {
      organisation,
      org_url: orgUrl.value ?? null,
      title,
      summary,
      description: text(b.description, 4000),
      causes,
      commitment: b.commitment,
      time_needed: text(b.timeNeeded, 120),
      signup_method: b.signupMethod,
      signup_url: signupUrl.value ?? null,
      signup_email: signupEmail,
      signup_steps: text(b.signupSteps, 1000),
      sessions: sessions.value,
      address: text(b.address, 200),
      postcode,
      nearest_station: text(b.nearestStation, 80),
      remote: b.remote === true,
      min_age: minAge,
      dbs: b.dbs,
      expenses_paid: b.expensesPaid === true,
      training: text(b.training, 500),
      accessibility: text(b.accessibility, 500),
      contact_name: text(b.contactName, 120),
      contact_email: contactEmail,
      active: b.active !== false,
    },
  };
}

// ── Reading ────────────────────────────────────────────────────────────────

/** The text the map looks an entry's place up by: its address and postcode. */
export function entryPlace(e: Pick<DirectoryEntry, "address" | "postcode">): string | null {
  return [e.address, e.postcode].filter(Boolean).join(", ") || null;
}

/** "Tue 18:00–20:00" */
export function sessionLabel(s: Pick<Session, "weekday" | "start" | "end">): string {
  return `${WEEKDAYS[s.weekday - 1]} ${s.start}–${s.end}`;
}

/** The facts a card shows as tags, in reading order. */
export function badges(e: DirectoryEntry): string[] {
  const out: string[] = [labelOf(COMMITMENT_KINDS, e.commitment)];
  if (e.timeNeeded) out.push(e.timeNeeded);
  if (e.remote) out.push("Can be remote");
  out.push(e.minAge ? `${e.minAge}+` : "Any age");
  out.push(labelOf(DBS_OPTIONS, e.dbs));
  if (e.expensesPaid) out.push("Expenses paid");
  return out;
}

/** How long a "last checked" date stays trustworthy before the page flags it. */
export const STALE_AFTER_DAYS = 180;

export function isStale(verifiedOn: string | null, today: string): boolean {
  if (!verifiedOn) return true;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${verifiedOn}T00:00:00Z`)) / 86_400_000;
  return days > STALE_AFTER_DAYS;
}

export interface DirectoryFilter {
  q: string;
  cause: Cause | "";
  /** ISO weekday the student is free, or 0 for any. */
  day: number;
  dropIn: boolean;
  noDbs: boolean;
  remote: boolean;
}

export const EMPTY_FILTER: DirectoryFilter = { q: "", cause: "", day: 0, dropIn: false, noDbs: false, remote: false };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Whether an entry fits. "Free on Tuesday" keeps flexible roles and anything
 * without fixed sessions, since those fit around you.
 */
export function matchesFilter(e: DirectoryEntry, f: DirectoryFilter): boolean {
  if (f.cause && !e.causes.includes(f.cause)) return false;
  if (f.dropIn && e.commitment !== "drop_in" && e.signupMethod !== "just_turn_up") return false;
  if (f.noDbs && e.dbs === "needed") return false;
  if (f.remote && !e.remote) return false;
  if (f.day && e.sessions.length && !e.sessions.some((s) => s.weekday === f.day)) return false;
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = fold([e.organisation, e.title, e.summary, e.description ?? "", e.address ?? "", e.nearestStation ?? "", e.postcode ?? ""].join(" "));
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}
