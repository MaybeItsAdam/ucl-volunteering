import { getSupabaseAdmin } from "@/lib/supabase";
import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  RESPONSE_KINDS,
  type AvailabilityBlock,
  type CommitteeMember,
  type EventCategory,
  type EventSource,
  type EventStatus,
  type PlanEvent,
  type ResponseKind,
} from "@/lib/types";
import { isMemberColour } from "@/lib/access";

/**
 * The committee's plan: events, who's going, and when people can't make it.
 *
 * Server only (it holds the service-role client). Pages call it directly from
 * Server Components; the routes under /api/plan wrap it for the browser.
 *
 * The parse* functions are pure and do all the input checking, so a route
 * only has to turn a `PlanError` into its status.
 */

/** A failure with the HTTP status a route should answer with. */
export class PlanError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500 = 400,
  ) {
    super(message);
    this.name = "PlanError";
  }
}

// ── Validation (pure) ────────────────────────────────────────────────────

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

const MAX_TITLE = 200;
const MAX_TEXT = 10_000;
const MAX_SHORT = 500;
const MAX_RANGE_DAYS = 400;

/** Columns a committee member may change on a feed row; the feed owns the rest. */
export const SOCIAL_IMPACT_EDITABLE = [
  "category",
  "status",
  "lead_member_id",
  "linked_event_id",
  "plan_doc_url",
  "instagram_url",
  "recap_url",
  "notes",
  "target_volunteers",
  "actual_attendance",
] as const;

type FieldKind = "title" | "instant" | "boolean" | "text" | "short" | "url" | "category" | "status" | "uuid" | "count";

/** Every column the API writes, by its camelCase name in `PlanEvent`. */
const EVENT_FIELDS: Record<string, { column: string; kind: FieldKind }> = {
  title: { column: "title", kind: "title" },
  startsAt: { column: "starts_at", kind: "instant" },
  endsAt: { column: "ends_at", kind: "instant" },
  allDay: { column: "all_day", kind: "boolean" },
  location: { column: "location", kind: "short" },
  description: { column: "description", kind: "text" },
  url: { column: "url", kind: "url" },
  category: { column: "category", kind: "category" },
  status: { column: "status", kind: "status" },
  leadMemberId: { column: "lead_member_id", kind: "uuid" },
  linkedEventId: { column: "linked_event_id", kind: "uuid" },
  planDocUrl: { column: "plan_doc_url", kind: "url" },
  instagramUrl: { column: "instagram_url", kind: "url" },
  recapUrl: { column: "recap_url", kind: "url" },
  notes: { column: "notes", kind: "text" },
  targetVolunteers: { column: "target_volunteers", kind: "count" },
  actualAttendance: { column: "actual_attendance", kind: "count" },
};

const COLUMN_TO_FIELD = Object.fromEntries(Object.entries(EVENT_FIELDS).map(([field, { column }]) => [column, field]));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One field's value, cleaned, or an error message. `undefined` never reaches here. */
function parseField(field: string, kind: FieldKind, value: unknown): Parsed<unknown> {
  const bad = (why: string): Parsed<unknown> => ({ ok: false, error: `${field} ${why}` });
  switch (kind) {
    case "title": {
      if (typeof value !== "string" || !value.trim()) return bad("is required");
      if (value.trim().length > MAX_TITLE) return bad(`must be at most ${MAX_TITLE} characters`);
      return { ok: true, value: value.trim() };
    }
    case "instant": {
      if (typeof value !== "string") return bad("must be an ISO date-time");
      const t = Date.parse(value);
      // A bare date would be read as UTC midnight, which is 01:00 in BST: refuse it.
      if (!Number.isFinite(t) || !/T\d{2}:\d{2}/.test(value)) return bad("must be an ISO date-time");
      return { ok: true, value: new Date(t).toISOString() };
    }
    case "boolean":
      return typeof value === "boolean" ? { ok: true, value } : bad("must be true or false");
    case "text":
    case "short": {
      if (value === null) return { ok: true, value: null };
      if (typeof value !== "string") return bad("must be text");
      const max = kind === "text" ? MAX_TEXT : MAX_SHORT;
      if (value.length > max) return bad(`must be at most ${max} characters`);
      return { ok: true, value: value.trim() || null };
    }
    case "url": {
      if (value === null || value === "") return { ok: true, value: null };
      if (typeof value !== "string") return bad("must be a link");
      try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:" && url.protocol !== "http:") return bad("must be an http(s) link");
        return { ok: true, value: url.toString() };
      } catch {
        return bad("must be a link");
      }
    }
    case "category":
      return EVENT_CATEGORIES.includes(value as EventCategory)
        ? { ok: true, value }
        : bad(`must be one of ${EVENT_CATEGORIES.join(", ")}`);
    case "status":
      return EVENT_STATUSES.includes(value as EventStatus)
        ? { ok: true, value }
        : bad(`must be one of ${EVENT_STATUSES.join(", ")}`);
    case "uuid":
      if (value === null) return { ok: true, value: null };
      return isUuid(value) ? { ok: true, value: value.toLowerCase() } : bad("must be an id");
    case "count":
      if (value === null) return { ok: true, value: null };
      return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100_000
        ? { ok: true, value }
        : bad("must be a whole number, 0 or more");
  }
}

/**
 * The columns a body sets, keyed by column. Accepts camelCase (`PlanEvent`)
 * or snake_case (column) names; refuses anything unknown, so a typo is a 400
 * rather than a silent no-op.
 */
function parseEventFields(body: unknown): Parsed<Record<string, unknown>> {
  if (!isPlainObject(body)) return { ok: false, error: "Body must be a JSON object" };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    const field = EVENT_FIELDS[key] ? key : COLUMN_TO_FIELD[key];
    if (!field) return { ok: false, error: `${key} cannot be set` };
    const { column, kind } = EVENT_FIELDS[field];
    const parsed = parseField(field, kind, value);
    if (!parsed.ok) return parsed;
    row[column] = parsed.value;
  }
  return { ok: true, value: row };
}

function checkTimes(startsAt: string, endsAt: string): string | null {
  return Date.parse(endsAt) > Date.parse(startsAt) ? null : "endsAt must be after startsAt";
}

/** A new VolSoc event. `title`, `startsAt`, `endsAt` and `category` are required. */
export function parseEventCreate(body: unknown): Parsed<Record<string, unknown>> {
  const parsed = parseEventFields(body);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  for (const [column, field] of [
    ["title", "title"],
    ["starts_at", "startsAt"],
    ["ends_at", "endsAt"],
    ["category", "category"],
  ]) {
    if (row[column] === undefined) return { ok: false, error: `${field} is required` };
  }
  const timeError = checkTimes(row.starts_at as string, row.ends_at as string);
  if (timeError) return { ok: false, error: timeError };
  return { ok: true, value: { status: "provisional", ...row, source: "volsoc" } };
}

/**
 * A partial update, as columns. On a feed row (anything not `volsoc`) only
 * `SOCIAL_IMPACT_EDITABLE` may change. The start/end check against the stored
 * row happens in `updateEvent`, which knows the other half.
 */
export function parseEventPatch(body: unknown, source: EventSource): Parsed<Record<string, unknown>> {
  const parsed = parseEventFields(body);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  if (!Object.keys(row).length) return { ok: false, error: "Nothing to change" };
  if (source !== "volsoc") {
    const locked = Object.keys(row).filter((c) => !(SOCIAL_IMPACT_EDITABLE as readonly string[]).includes(c));
    if (locked.length) {
      return {
        ok: false,
        error: `${locked.map((c) => COLUMN_TO_FIELD[c] ?? c).join(", ")} come${locked.length === 1 ? "s" : ""} from the ${source === "social_impact" ? "Social Impact" : "VolSoc"} calendar on the Toolbox and can't be changed here`,
      };
    }
  }
  if (typeof row.title === "string" && !row.title) return { ok: false, error: "title is required" };
  return { ok: true, value: row };
}

/** `{ response: "going" | "maybe" | "no" | null }`; null clears it. */
export function parseResponse(body: unknown): Parsed<ResponseKind | null> {
  if (!isPlainObject(body) || !("response" in body)) return { ok: false, error: "response is required" };
  const { response } = body;
  if (response === null) return { ok: true, value: null };
  return RESPONSE_KINDS.includes(response as ResponseKind)
    ? { ok: true, value: response as ResponseKind }
    : { ok: false, error: `response must be one of ${RESPONSE_KINDS.join(", ")} or null` };
}

export type AvailabilityInput = Omit<AvailabilityBlock, "id" | "memberId">;

const MAX_BLOCKS = 300;

/**
 * `{ blocks: [{ weekday, startMinute, endMinute, note? }] }`, validated, sorted,
 * and with touching or overlapping blocks of the same day and note merged, so
 * a drag-painted run of 30-minute cells is stored as one block.
 */
export function parseAvailability(body: unknown): Parsed<AvailabilityInput[]> {
  if (!isPlainObject(body) || !Array.isArray(body.blocks)) return { ok: false, error: "blocks must be a list" };
  if (body.blocks.length > MAX_BLOCKS) return { ok: false, error: `At most ${MAX_BLOCKS} blocks` };
  const blocks: AvailabilityInput[] = [];
  for (const [i, raw] of body.blocks.entries()) {
    const at = `blocks[${i}]`;
    if (!isPlainObject(raw)) return { ok: false, error: `${at} must be an object` };
    const { weekday, startMinute, endMinute } = raw;
    if (!Number.isInteger(weekday) || (weekday as number) < 1 || (weekday as number) > 7) {
      return { ok: false, error: `${at}.weekday must be 1 (Monday) to 7 (Sunday)` };
    }
    if (!Number.isInteger(startMinute) || (startMinute as number) < 0 || (startMinute as number) > 1439) {
      return { ok: false, error: `${at}.startMinute must be a whole number from 0 to 1439` };
    }
    if (!Number.isInteger(endMinute) || (endMinute as number) < 1 || (endMinute as number) > 1440) {
      return { ok: false, error: `${at}.endMinute must be a whole number from 1 to 1440` };
    }
    if ((endMinute as number) <= (startMinute as number)) return { ok: false, error: `${at}.endMinute must be after startMinute` };
    let note: string | null = null;
    if (raw.note !== undefined && raw.note !== null) {
      if (typeof raw.note !== "string" || raw.note.length > 200) return { ok: false, error: `${at}.note must be text up to 200 characters` };
      note = raw.note.trim() || null;
    }
    blocks.push({ weekday: weekday as number, startMinute: startMinute as number, endMinute: endMinute as number, note });
  }
  return { ok: true, value: mergeBlocks(blocks) };
}

/** Sorted by day then start, with touching/overlapping blocks of the same day and note joined. */
export function mergeBlocks(blocks: AvailabilityInput[]): AvailabilityInput[] {
  const sorted = [...blocks].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const out: AvailabilityInput[] = [];
  for (const block of sorted) {
    const last = out.findLast((b) => b.weekday === block.weekday && b.note === block.note);
    if (last && block.startMinute <= last.endMinute) last.endMinute = Math.max(last.endMinute, block.endMinute);
    else out.push({ ...block });
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

/** `?from=&to=` as instants; `to` after `from`, at most ~13 months apart. */
export function parseRange(from: string | null, to: string | null): Parsed<{ from: Date; to: Date }> {
  if (!from || !to) return { ok: false, error: "from and to are required" };
  const f = new Date(from);
  const t = new Date(to);
  if (!Number.isFinite(f.getTime()) || !Number.isFinite(t.getTime())) return { ok: false, error: "from and to must be ISO dates" };
  if (t <= f) return { ok: false, error: "to must be after from" };
  if (t.getTime() - f.getTime() > MAX_RANGE_DAYS * 86_400_000) return { ok: false, error: `At most ${MAX_RANGE_DAYS} days at once` };
  return { ok: true, value: { from: f, to: t } };
}

// ── Rows ─────────────────────────────────────────────────────────────────

const EVENT_SELECT = "*, event_responses(member_id, response)";

interface EventRow {
  id: string;
  source: EventSource;
  category: EventCategory;
  toolbox_uid: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  url: string | null;
  status: EventStatus;
  lead_member_id: string | null;
  linked_event_id: string | null;
  plan_doc_url: string | null;
  instagram_url: string | null;
  recap_url: string | null;
  notes: string | null;
  target_volunteers: number | null;
  actual_attendance: number | null;
  created_by: string | null;
  updated_at: string;
  removed_at: string | null;
  event_responses?: { member_id: string; response: ResponseKind }[] | null;
}

/** Postgres gives `+00:00` timestamps; the UI gets `Z` ISO strings. */
const iso = (value: string) => new Date(value).toISOString();
const isoOrNull = (value: string | null) => (value ? iso(value) : null);

export function rowToEvent(row: EventRow): PlanEvent {
  return {
    id: row.id,
    source: row.source,
    category: row.category,
    title: row.title,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    allDay: row.all_day,
    location: row.location,
    description: row.description,
    url: row.url,
    status: row.status,
    leadMemberId: row.lead_member_id,
    linkedEventId: row.linked_event_id,
    planDocUrl: row.plan_doc_url,
    instagramUrl: row.instagram_url,
    recapUrl: row.recap_url,
    notes: row.notes,
    targetVolunteers: row.target_volunteers,
    actualAttendance: row.actual_attendance,
    removedAt: isoOrNull(row.removed_at),
    createdBy: row.created_by,
    updatedAt: iso(row.updated_at),
    responses: (row.event_responses ?? [])
      .map((r) => ({ memberId: r.member_id, response: r.response }))
      .sort((a, b) => a.memberId.localeCompare(b.memberId)),
  };
}

function dbError(error: { message: string; code?: string }): PlanError {
  // 23503: a lead or linked event that doesn't exist. 23514: a check constraint.
  if (error.code === "23503") return new PlanError("That member or event doesn't exist", 400);
  if (error.code === "23514") return new PlanError("Those values aren't allowed together", 400);
  return new PlanError(`Database error: ${error.message}`, 500);
}

// ── Events ───────────────────────────────────────────────────────────────

/** Events overlapping `[from, to)`, earliest first. Removed feed events only if asked. */
export async function listEvents(
  from: Date | string,
  to: Date | string,
  options: { includeRemoved?: boolean } = {},
): Promise<PlanEvent[]> {
  let query = getSupabaseAdmin()
    .from("events")
    .select(EVENT_SELECT)
    .lt("starts_at", new Date(to).toISOString())
    .gt("ends_at", new Date(from).toISOString())
    .order("starts_at", { ascending: true })
    .order("title", { ascending: true });
  if (!options.includeRemoved) query = query.is("removed_at", null);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data as EventRow[]).map(rowToEvent);
}

export async function getEvent(id: string): Promise<PlanEvent | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await getSupabaseAdmin().from("events").select(EVENT_SELECT).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  return data ? rowToEvent(data as EventRow) : null;
}

async function checkReferences(row: Record<string, unknown>, selfId?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (typeof row.linked_event_id === "string") {
    if (row.linked_event_id === selfId) throw new PlanError("An event can't be linked to itself");
    const { data } = await supabase.from("events").select("id").eq("id", row.linked_event_id).maybeSingle();
    if (!data) throw new PlanError("The linked event doesn't exist");
  }
  if (typeof row.lead_member_id === "string") {
    const { data } = await supabase
      .from("members")
      .select("id")
      .eq("id", row.lead_member_id)
      .not("governance_role", "is", null)
      .maybeSingle();
    if (!data) throw new PlanError("The lead must be on the committee");
  }
}

/** Create a VolSoc event from an API body. Throws `PlanError` on bad input. */
export async function createEvent(createdBy: string, body: unknown): Promise<PlanEvent> {
  const parsed = parseEventCreate(body);
  if (!parsed.ok) throw new PlanError(parsed.error);
  await checkReferences(parsed.value);
  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .insert({ ...parsed.value, created_by: createdBy })
    .select(EVENT_SELECT)
    .single();
  if (error) throw dbError(error);
  return rowToEvent(data as EventRow);
}

/**
 * Apply a partial update from an API body. Social Impact rows accept only the
 * committee's fields. Returns the event before and after, for the audit log.
 */
export async function updateEvent(id: string, body: unknown): Promise<{ before: PlanEvent; event: PlanEvent; changed: string[] }> {
  const before = await getEvent(id);
  if (!before) throw new PlanError("No such event", 404);
  const parsed = parseEventPatch(body, before.source);
  if (!parsed.ok) throw new PlanError(parsed.error);
  const row = parsed.value;

  const startsAt = (row.starts_at as string | undefined) ?? before.startsAt;
  const endsAt = (row.ends_at as string | undefined) ?? before.endsAt;
  if (row.starts_at !== undefined || row.ends_at !== undefined) {
    const timeError = checkTimes(startsAt, endsAt);
    if (timeError) throw new PlanError(timeError);
  }
  await checkReferences(row, id);

  const { data, error } = await getSupabaseAdmin().from("events").update(row).eq("id", id).select(EVENT_SELECT).single();
  if (error) throw dbError(error);
  return { before, event: rowToEvent(data as EventRow), changed: Object.keys(row).map((c) => COLUMN_TO_FIELD[c] ?? c) };
}

/** Delete a VolSoc event. Social Impact rows belong to the feed and are never deleted. */
export async function deleteEvent(id: string): Promise<PlanEvent> {
  const event = await getEvent(id);
  if (!event) throw new PlanError("No such event", 404);
  if (event.source !== "volsoc") {
    throw new PlanError("Social Impact events come from their calendar and can't be deleted; cancel it instead", 400);
  }
  const { error } = await getSupabaseAdmin().from("events").delete().eq("id", id);
  if (error) throw dbError(error);
  return event;
}

/** Set (or with null, clear) one member's going/maybe/no on an event. */
export async function setResponse(eventId: string, memberId: string, response: ResponseKind | null): Promise<void> {
  if (!(await getEvent(eventId))) throw new PlanError("No such event", 404);
  const supabase = getSupabaseAdmin();
  const { error } =
    response === null
      ? await supabase.from("event_responses").delete().eq("event_id", eventId).eq("member_id", memberId)
      : await supabase
          .from("event_responses")
          .upsert(
            { event_id: eventId, member_id: memberId, response, updated_at: new Date().toISOString() },
            { onConflict: "event_id,member_id" },
          );
  if (error) throw dbError(error);
}

// ── Committee and availability ───────────────────────────────────────────

/** Everyone with a governance role, by name. */
export async function listCommittee(): Promise<CommitteeMember[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .select("id, name, colour")
    .not("governance_role", "is", null)
    .order("name", { ascending: true });
  if (error) throw dbError(error);
  return (data ?? []).map((m) => ({ id: m.id, name: m.name, colour: isMemberColour(m.colour) ? m.colour : null }));
}

interface BlockRow {
  id: string;
  member_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  note: string | null;
}

const blockFromRow = (row: BlockRow): AvailabilityBlock => ({
  id: row.id,
  memberId: row.member_id,
  weekday: row.weekday,
  startMinute: row.start_minute,
  endMinute: row.end_minute,
  note: row.note,
});

const BLOCK_SELECT = "id, member_id, weekday, start_minute, end_minute, note";

/**
 * The committee's unavailability, with the committee it belongs to. Blocks of
 * people no longer on the committee are left out (and kept, should they return).
 * Pass `memberId` for one person's only.
 */
export async function listAvailability(memberId?: string): Promise<{ blocks: AvailabilityBlock[]; members: CommitteeMember[] }> {
  const members = await listCommittee();
  let query = getSupabaseAdmin()
    .from("availability_blocks")
    .select(BLOCK_SELECT)
    .order("weekday", { ascending: true })
    .order("start_minute", { ascending: true });
  if (memberId) query = query.eq("member_id", memberId);
  const { data, error } = await query;
  if (error) throw dbError(error);
  const committee = new Set(members.map((m) => m.id));
  const blocks = (data as BlockRow[]).map(blockFromRow).filter((b) => committee.has(b.memberId));
  return { blocks, members };
}

/**
 * Replace one member's weekly unavailability with `body.blocks`. The new set
 * goes in before the old one comes out, so a failure leaves the old set
 * rather than nothing.
 */
export async function replaceAvailability(memberId: string, body: unknown): Promise<AvailabilityBlock[]> {
  const parsed = parseAvailability(body);
  if (!parsed.ok) throw new PlanError(parsed.error);
  const supabase = getSupabaseAdmin();

  const { data: old, error: oldError } = await supabase.from("availability_blocks").select("id").eq("member_id", memberId);
  if (oldError) throw dbError(oldError);

  let inserted: BlockRow[] = [];
  if (parsed.value.length) {
    const { data, error } = await supabase
      .from("availability_blocks")
      .insert(
        parsed.value.map((b) => ({
          member_id: memberId,
          weekday: b.weekday,
          start_minute: b.startMinute,
          end_minute: b.endMinute,
          note: b.note,
        })),
      )
      .select(BLOCK_SELECT);
    if (error) throw dbError(error);
    inserted = data as BlockRow[];
  }

  const oldIds = (old ?? []).map((r) => r.id as string);
  if (oldIds.length) {
    const { error } = await supabase.from("availability_blocks").delete().in("id", oldIds);
    if (error) throw dbError(error);
  }
  return inserted.map(blockFromRow).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}
