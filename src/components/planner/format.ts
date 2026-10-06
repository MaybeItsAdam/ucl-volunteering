import { londonDayKey, shiftDayKey } from "@/lib/planTime";
import { BOARD_STATUSES, finalStatus, type Task, type TaskBoard, type TaskStatus } from "@/lib/types";
import { dayLabel } from "@/components/plan/format";

/** Display helpers for the planner. Pure; safe on server and client. */

/** An event's page in the plan; one place to change if the plan's routes move. */
export const eventHref = (id: string) => `/portal/calendar/events/${id}`;

/** A planner board's page. */
export const boardHref = (board: TaskBoard) => (board === "documents" ? "/portal/planner/documents" : "/portal/planner");

/** A board filtered to an event. */
export const boardEventHref = (board: TaskBoard, eventId: string) => `${boardHref(board)}?event=${eventId}`;

/** A board, with the add sheet open for an event. */
export const addTaskHref = (board: TaskBoard, eventId: string) => `${boardEventHref(board, eventId)}&new=1`;

/** An event as the planner's pickers list it. */
export interface EventOption {
  id: string;
  title: string;
  startsAt: string;
}

/** "Sat 24 Oct · Litter pick" */
export function eventOptionLabel(event: EventOption): string {
  return `${dayLabel(londonDayKey(new Date(event.startsAt)))} · ${event.title}`;
}

/** How many days ahead a due date counts as "soon". */
export const DUE_SOON_DAYS = 3;

export type DueTone = "bad" | "warn" | "neutral";

/**
 * The due tag for an item on `today` (a London day key): overdue in the danger
 * colour, due within `DUE_SOON_DAYS` in the warning colour, later or finished
 * plain. Null when there's no due date.
 */
export function dueState(task: Pick<Task, "dueOn" | "completedAt">, today: string): { label: string; tone: DueTone } | null {
  const due = task.dueOn;
  if (!due) return null;
  if (task.completedAt) return { label: `Due ${dayLabel(due)}`, tone: "neutral" };
  if (due < today) return { label: `Overdue · ${dayLabel(due)}`, tone: "bad" };
  if (due === today) return { label: "Due today", tone: "warn" };
  if (due === shiftDayKey(today, 1)) return { label: "Due tomorrow", tone: "warn" };
  if (due <= shiftDayKey(today, DUE_SOON_DAYS)) return { label: `Due ${dayLabel(due)}`, tone: "warn" };
  return { label: `Due ${dayLabel(due)}`, tone: "neutral" };
}

export const DUE_TAG: Record<DueTone, string> = { bad: "tag bad", warn: "tag warn", neutral: "tag" };

/** "all", "actions" (items with no event) or an event id. */
export type EventFilter = string;

export interface TaskFilter {
  mine: boolean;
  event: EventFilter;
}

/** The event filter from the address bar. "none" was its name for actions before the boards split. */
export function readEventFilter(value: string | undefined, isEventId: (v: string) => boolean): EventFilter {
  if (value === "actions" || value === "none") return "actions";
  return value && isEventId(value) ? value.toLowerCase() : "all";
}

export function matches(task: Task, filter: TaskFilter, myId: string): boolean {
  if (filter.mine && task.assigneeId !== myId) return false;
  if (filter.event === "actions") return task.eventId === null;
  if (filter.event !== "all") return task.eventId === filter.event;
  return true;
}

/**
 * A board's columns, keyed by status. Open columns: soonest due first,
 * undated last, then oldest first. The last column: most recently finished
 * first. Items from the other board are left out.
 */
export function columns(board: TaskBoard, tasks: Task[]): Record<TaskStatus, Task[]> {
  const out = Object.fromEntries(BOARD_STATUSES[board].map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const task of tasks) if (task.board === board) out[task.status]?.push(task);
  const byDue = (a: Task, b: Task) =>
    (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") || a.createdAt.localeCompare(b.createdAt);
  const last = finalStatus(board);
  for (const status of BOARD_STATUSES[board]) {
    out[status].sort(status === last ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : byDue);
  }
  return out;
}

/** The column a card's one-tap button moves it to, or null in the last column (going back is in the sheet). */
export function nextStatus(board: TaskBoard, status: TaskStatus): TaskStatus | null {
  const statuses: readonly TaskStatus[] = BOARD_STATUSES[board];
  const at = statuses.indexOf(status);
  return at >= 0 && at < statuses.length - 1 ? statuses[at + 1] : null;
}

/** What each empty column says. */
export const EMPTY_COLUMN: Record<TaskStatus, string> = {
  backlog: "Nothing in the backlog",
  planned: "Nothing planned yet",
  ready_to_post: "Nothing waiting to post",
  content: "No content to make",
  done: "Nothing done lately",
  drafting: "Nothing being drafted",
  in_review: "Nothing in review",
  submitted: "Nothing waiting on a reply",
  approved: "Nothing approved lately",
};

/** What each column is for, under its name. */
export const COLUMN_HINT: Partial<Record<TaskStatus, string>> = {
  ready_to_post: "Publicity ready to go out",
  content: "Photos, recaps and posts after the event",
  submitted: "Sent to the SU or UCL",
};

/** The tag for a column: plain at the start, azure in progress, emerald once finished. */
export function statusTag(board: TaskBoard, status: TaskStatus): string {
  if (status === finalStatus(board)) return "tag ok";
  return status === "backlog" ? "tag" : "tag info";
}
