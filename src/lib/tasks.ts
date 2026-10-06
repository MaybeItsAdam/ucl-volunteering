import { getSupabaseAdmin } from "@/lib/supabase";
import { isDayKey } from "@/lib/planTime";
import { isUuid, PlanError, type Parsed } from "@/lib/plan";
import {
  BOARD_STATUSES,
  finalStatus,
  isBoardStatus,
  TASK_BOARDS,
  TASK_STATUS_LABELS,
  type EventStatus,
  type Task,
  type TaskBoard,
  type TaskStatus,
} from "@/lib/types";

/**
 * The committee's planner items: the Planner tab's two boards (events and
 * documents), and the Tasks section on an event.
 *
 * Server only (it holds the service-role client), like `plan.ts`, whose
 * `PlanError` it throws so the /api/tasks routes share the plan's error
 * handling. The parse* functions are pure and do all the input checking.
 */

// ── Validation (pure) ────────────────────────────────────────────────────

const MAX_TITLE = 200;
const MAX_NOTES = 10_000;
const MAX_URL = 2_000;

type FieldKind = "title" | "notes" | "board" | "status" | "assignee" | "uuid" | "day" | "url";

/** Every column the API writes, by its camelCase name in `Task`. */
const TASK_FIELDS: Record<string, { column: string; kind: FieldKind }> = {
  board: { column: "board", kind: "board" },
  title: { column: "title", kind: "title" },
  notes: { column: "notes", kind: "notes" },
  status: { column: "status", kind: "status" },
  assigneeId: { column: "assignee_member_id", kind: "assignee" },
  dueOn: { column: "due_on", kind: "day" },
  eventId: { column: "event_id", kind: "uuid" },
  docUrl: { column: "doc_url", kind: "url" },
};

const COLUMN_TO_FIELD = Object.fromEntries(Object.entries(TASK_FIELDS).map(([field, { column }]) => [column, field]));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseField(field: string, kind: FieldKind, value: unknown): Parsed<unknown> {
  const bad = (why: string): Parsed<unknown> => ({ ok: false, error: `${field} ${why}` });
  switch (kind) {
    case "title": {
      if (typeof value !== "string" || !value.trim()) return bad("is required");
      if (value.trim().length > MAX_TITLE) return bad(`must be at most ${MAX_TITLE} characters`);
      return { ok: true, value: value.trim() };
    }
    case "notes": {
      if (value === null) return { ok: true, value: null };
      if (typeof value !== "string") return bad("must be text");
      if (value.length > MAX_NOTES) return bad(`must be at most ${MAX_NOTES} characters`);
      return { ok: true, value: value.trim() || null };
    }
    case "board":
      return TASK_BOARDS.includes(value as TaskBoard) ? { ok: true, value } : bad(`must be one of ${TASK_BOARDS.join(", ")}`);
    case "status":
      // Which statuses are allowed depends on the board; `checkStatus` decides once both are known.
      return typeof value === "string" && Object.hasOwn(TASK_STATUS_LABELS, value) ? { ok: true, value } : bad("isn't a planner column");
    case "assignee":
      if (value === null || value === "" || value === undefined) return bad("is required: every item belongs to someone on the committee");
      return isUuid(value) ? { ok: true, value: value.toLowerCase() } : bad("must be an id");
    case "uuid":
      if (value === null || value === "") return { ok: true, value: null };
      return isUuid(value) ? { ok: true, value: value.toLowerCase() } : bad("must be an id");
    case "day":
      if (value === null || value === "") return { ok: true, value: null };
      return isDayKey(value) ? { ok: true, value } : bad("must be a date (YYYY-MM-DD)");
    case "url": {
      if (value === null || value === "") return { ok: true, value: null };
      if (typeof value !== "string") return bad("must be a link");
      try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:" && url.protocol !== "http:") return bad("must be an http(s) link");
        const href = url.toString();
        return href.length > MAX_URL ? bad(`must be at most ${MAX_URL} characters`) : { ok: true, value: href };
      } catch {
        return bad("must be a link");
      }
    }
  }
}

/** The columns a body sets. camelCase or snake_case; anything unknown is a 400, not a silent no-op. */
function parseTaskFields(body: unknown): Parsed<Record<string, unknown>> {
  if (!isPlainObject(body)) return { ok: false, error: "Body must be a JSON object" };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    const field = TASK_FIELDS[key] ? key : COLUMN_TO_FIELD[key];
    if (!field) return { ok: false, error: `${key} cannot be set` };
    const { column, kind } = TASK_FIELDS[field];
    const parsed = parseField(field, kind, value);
    if (!parsed.ok) return parsed;
    row[column] = parsed.value;
  }
  return { ok: true, value: row };
}

/** Where an item sits: its board and its column there. */
export interface Placement {
  board: TaskBoard;
  status: TaskStatus;
}

function checkStatus({ board, status }: Placement): Parsed<Placement> {
  return isBoardStatus(board, status)
    ? { ok: true, value: { board, status } }
    : { ok: false, error: `status must be one of ${BOARD_STATUSES[board].join(", ")} on the ${board} board` };
}

/**
 * When a move changes `completed_at`: stamped on reaching the board's last
 * column (Done or Approved), cleared on leaving it, untouched otherwise (so
 * re-saving a finished item keeps its date).
 */
export function completionFor(before: Placement, after: Placement, now: Date): { completed_at?: string | null } {
  if (after.board === before.board && after.status === before.status) return {};
  const wasFinished = before.status === finalStatus(before.board);
  const isFinished = after.status === finalStatus(after.board);
  if (isFinished) return wasFinished ? {} : { completed_at: now.toISOString() };
  return { completed_at: null };
}

/** A new item. `title` and `assigneeId` are required; it goes on the events board, in Backlog, unless told otherwise. */
export function parseTaskCreate(body: unknown, now = new Date()): Parsed<Record<string, unknown>> {
  const parsed = parseTaskFields(body);
  if (!parsed.ok) return parsed;
  const row: Record<string, unknown> = { board: "events", status: "backlog", ...parsed.value };
  if (row.title === undefined) return { ok: false, error: "title is required" };
  if (row.assignee_member_id === undefined) return { ok: false, error: "assigneeId is required: every item belongs to someone on the committee" };
  const placed = checkStatus({ board: row.board as TaskBoard, status: row.status as TaskStatus });
  if (!placed.ok) return placed;
  if (placed.value.status === finalStatus(placed.value.board)) row.completed_at = now.toISOString();
  return { ok: true, value: row };
}

/**
 * A partial update, as columns, with `completed_at` following the column.
 * Moving to the other board without a status keeps the column if that board
 * has it (Backlog), else starts again in Backlog.
 */
export function parseTaskPatch(body: unknown, before: Placement, now = new Date()): Parsed<Record<string, unknown>> {
  const parsed = parseTaskFields(body);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  if (!Object.keys(row).length) return { ok: false, error: "Nothing to change" };
  const board = (row.board as TaskBoard | undefined) ?? before.board;
  if (row.status === undefined && board !== before.board) {
    row.status = isBoardStatus(board, before.status) ? before.status : "backlog";
  }
  const placed = checkStatus({ board, status: (row.status as TaskStatus | undefined) ?? before.status });
  if (!placed.ok) return placed;
  return { ok: true, value: { ...row, ...completionFor(before, placed.value, now) } };
}

// ── Rows ─────────────────────────────────────────────────────────────────

const TASK_SELECT = "*, event:events(id, title, starts_at, status)";

export interface TaskRow {
  id: string;
  board: TaskBoard;
  title: string;
  notes: string | null;
  status: TaskStatus;
  assignee_member_id: string;
  due_on: string | null;
  event_id: string | null;
  doc_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  event?: { id: string; title: string; starts_at: string; status: EventStatus } | null;
}

const iso = (value: string) => new Date(value).toISOString();

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    board: row.board,
    title: row.title,
    notes: row.notes,
    status: row.status,
    assigneeId: row.assignee_member_id,
    dueOn: row.due_on,
    eventId: row.event_id,
    event: row.event ? { id: row.event.id, title: row.event.title, startsAt: iso(row.event.starts_at), status: row.event.status } : null,
    docUrl: row.doc_url,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    completedAt: row.completed_at ? iso(row.completed_at) : null,
  };
}

function dbError(error: { message: string; code?: string }): PlanError {
  if (error.code === "23503") return new PlanError("That member or event doesn't exist", 400);
  if (error.code === "23502") return new PlanError("Every item needs someone on the committee to own it", 400);
  if (error.code === "23514") return new PlanError("Those values aren't allowed together", 400);
  return new PlanError(`Database error: ${error.message}`, 500);
}

// ── Items ────────────────────────────────────────────────────────────────

/** How long a finished item stays in its board's last column. An event's own list keeps them all. */
export const DONE_WINDOW_DAYS = 30;

/**
 * Items, soonest due first (undated last), then oldest first. `board` keeps
 * one board's, `eventId` one event's (from both boards); `doneSince` drops
 * items finished before then, so the last column doesn't grow forever.
 */
export async function listTasks(options: { board?: TaskBoard; eventId?: string; doneSince?: Date } = {}): Promise<Task[]> {
  let query = getSupabaseAdmin()
    .from("tasks")
    .select(TASK_SELECT)
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (options.board) query = query.eq("board", options.board);
  if (options.eventId) {
    if (!isUuid(options.eventId)) return [];
    query = query.eq("event_id", options.eventId);
  }
  // `completed_at` is set exactly when an item is in its board's last column.
  if (options.doneSince) query = query.or(`completed_at.is.null,completed_at.gte.${options.doneSince.toISOString()}`);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data as TaskRow[]).map(rowToTask);
}

export async function getTask(id: string): Promise<Task | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await getSupabaseAdmin().from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  return data ? rowToTask(data as TaskRow) : null;
}

/** The assignee must be on the committee and the event must exist; a clear 400 beats a foreign-key error. */
async function checkReferences(row: Record<string, unknown>): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (typeof row.event_id === "string") {
    const { data } = await supabase.from("events").select("id").eq("id", row.event_id).maybeSingle();
    if (!data) throw new PlanError("That event doesn't exist");
  }
  if (typeof row.assignee_member_id === "string") {
    const { data } = await supabase
      .from("members")
      .select("id")
      .eq("id", row.assignee_member_id)
      .not("governance_role", "is", null)
      .maybeSingle();
    if (!data) throw new PlanError("Items can only go to someone on the committee");
  }
}

/** Create an item from an API body. Throws `PlanError` on bad input. */
export async function createTask(createdBy: string, body: unknown): Promise<Task> {
  const parsed = parseTaskCreate(body);
  if (!parsed.ok) throw new PlanError(parsed.error);
  await checkReferences(parsed.value);
  const { data, error } = await getSupabaseAdmin()
    .from("tasks")
    .insert({ ...parsed.value, created_by: createdBy })
    .select(TASK_SELECT)
    .single();
  if (error) throw dbError(error);
  return rowToTask(data as TaskRow);
}

/** Apply a partial update. Returns the item before and after, and the fields that changed, for the audit log. */
export async function updateTask(id: string, body: unknown): Promise<{ before: Task; task: Task; changed: string[] }> {
  const before = await getTask(id);
  if (!before) throw new PlanError("No such item", 404);
  const parsed = parseTaskPatch(body, before);
  if (!parsed.ok) throw new PlanError(parsed.error);
  await checkReferences(parsed.value);
  const { data, error } = await getSupabaseAdmin().from("tasks").update(parsed.value).eq("id", id).select(TASK_SELECT).single();
  if (error) throw dbError(error);
  const changed = Object.keys(parsed.value)
    .filter((c) => c !== "completed_at")
    .map((c) => COLUMN_TO_FIELD[c] ?? c);
  return { before, task: rowToTask(data as TaskRow), changed };
}

export async function deleteTask(id: string): Promise<Task> {
  const task = await getTask(id);
  if (!task) throw new PlanError("No such item", 404);
  const { error } = await getSupabaseAdmin().from("tasks").delete().eq("id", id);
  if (error) throw dbError(error);
  return task;
}

/** How many unfinished items someone owns, so removing them from the committee can say who still has work to hand on. */
export async function countOpenTasks(memberId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assignee_member_id", memberId)
    .is("completed_at", null);
  if (error) throw dbError(error);
  return count ?? 0;
}
