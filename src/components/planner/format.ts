import { londonDayKey, shiftDayKey } from "@/lib/planTime";
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { dayLabel } from "@/components/plan/format";

/** Display helpers for the planner. Pure; safe on server and client. */

/** An event's page in the plan; one place to change if the plan's routes move. */
export const eventHref = (id: string) => `/portal/plan/events/${id}`;

/** The planner, with the add-a-task sheet open for an event. */
export const addTaskHref = (eventId: string) => `/portal/planner?event=${eventId}&new=1`;

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
 * The due tag for a task on `today` (a London day key): overdue in the danger
 * colour, due within `DUE_SOON_DAYS` in the warning colour, later or finished
 * plain. Null when there's no due date.
 */
export function dueState(task: Pick<Task, "dueOn" | "status">, today: string): { label: string; tone: DueTone } | null {
  const due = task.dueOn;
  if (!due) return null;
  if (task.status === "done") return { label: `Due ${dayLabel(due)}`, tone: "neutral" };
  if (due < today) return { label: `Overdue · ${dayLabel(due)}`, tone: "bad" };
  if (due === today) return { label: "Due today", tone: "warn" };
  if (due === shiftDayKey(today, 1)) return { label: "Due tomorrow", tone: "warn" };
  if (due <= shiftDayKey(today, DUE_SOON_DAYS)) return { label: `Due ${dayLabel(due)}`, tone: "warn" };
  return { label: `Due ${dayLabel(due)}`, tone: "neutral" };
}

export const DUE_TAG: Record<DueTone, string> = { bad: "tag bad", warn: "tag warn", neutral: "tag" };

/** "all", "none" (not for any event) or an event id. */
export type EventFilter = string;

export interface TaskFilter {
  mine: boolean;
  event: EventFilter;
}

export function matches(task: Task, filter: TaskFilter, myId: string): boolean {
  if (filter.mine && task.assigneeId !== myId) return false;
  if (filter.event === "none") return task.eventId === null;
  if (filter.event !== "all") return task.eventId === filter.event;
  return true;
}

/**
 * The board's columns. Open tasks: soonest due first, undated last, then
 * oldest first. Done: most recently finished first.
 */
export function columns(tasks: Task[]): Record<TaskStatus, Task[]> {
  const out = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const task of tasks) out[task.status].push(task);
  const byDue = (a: Task, b: Task) =>
    (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") || a.createdAt.localeCompare(b.createdAt);
  out.todo.sort(byDue);
  out.doing.sort(byDue);
  out.done.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  return out;
}

/** The status a card's one-tap button moves to: start it, finish it, or reopen it. */
export const NEXT_STATUS: Record<TaskStatus, { to: TaskStatus; label: string }> = {
  todo: { to: "doing", label: "Start" },
  doing: { to: "done", label: "Done" },
  done: { to: "todo", label: "Reopen" },
};
