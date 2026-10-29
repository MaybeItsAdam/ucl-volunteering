import { shiftDayKey, daysBetween, londonDayKey } from "@/lib/planTime";
import type { Task } from "@/lib/types";

/**
 * "Copy tasks from another event": the checklist you rebuild for every event.
 * Each copy starts back in Backlog, and a due date keeps its distance from the
 * event (a week before stays a week before). Pure; the route inserts the rows.
 */

export interface CloneSource {
  board: Task["board"];
  title: string;
  notes: string | null;
  assigneeId: string;
  dueOn: string | null;
  docUrl: string | null;
}

export interface CloneRow {
  board: Task["board"];
  title: string;
  notes: string | null;
  status: "backlog";
  assignee_member_id: string;
  due_on: string | null;
  event_id: string;
  doc_url: null;
}

/**
 * `stillOnCommittee` says who can still own an item; anyone who's left is
 * replaced by `fallbackId` (whoever is copying), since every item needs an owner.
 */
export function cloneRows(
  sources: CloneSource[],
  fromStart: string,
  toStart: string,
  toEventId: string,
  stillOnCommittee: ReadonlySet<string>,
  fallbackId: string,
): CloneRow[] {
  const fromDay = londonDayKey(new Date(fromStart));
  const toDay = londonDayKey(new Date(toStart));
  return sources.map((s) => ({
    board: s.board,
    title: s.title,
    notes: s.notes,
    status: "backlog",
    assignee_member_id: stillOnCommittee.has(s.assigneeId) ? s.assigneeId : fallbackId,
    due_on: s.dueOn ? shiftDayKey(toDay, daysBetween(fromDay, s.dueOn)) : null,
    event_id: toEventId,
    doc_url: null,
  }));
}
