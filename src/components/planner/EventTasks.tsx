import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { listCommittee } from "@/lib/plan";
import { londonDayKey } from "@/lib/planTime";
import { listTasks } from "@/lib/tasks";
import { BOARD_STATUSES, TASK_BOARDS, TASK_BOARD_LABELS, TASK_STATUS_LABELS, type CommitteeMember, type Task } from "@/lib/types";
import { addTaskHref, boardEventHref, columns, DUE_TAG, dueState, statusTag } from "./format";
import "./planner.css";

/**
 * The Tasks panel on an event's page: its items from both planner boards,
 * each tagged with its board and column, unfinished first, with ways into
 * each board to add more. Server Component; a failure to load hides nothing
 * else on the page.
 */
export async function EventTasks({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  let tasks: Task[] = [];
  let committee: CommitteeMember[] = [];
  let loadError = false;
  try {
    [tasks, committee] = await Promise.all([listTasks({ eventId }), listCommittee()]);
  } catch (error) {
    console.error("[planner] event tasks", error);
    loadError = true;
  }
  const names = new Map(committee.map((m) => [m.id, m.name]));
  const today = londonDayKey(new Date());
  // Furthest along first within each board, events board before documents, finished items last.
  const open: Task[] = [];
  const finished: Task[] = [];
  for (const board of TASK_BOARDS) {
    const cols = columns(board, tasks);
    for (const status of [...BOARD_STATUSES[board]].reverse()) {
      for (const task of cols[status]) (task.completedAt ? finished : open).push(task);
    }
  }
  const ordered = [...open, ...finished];

  return (
    <div className="panel flush">
      <div className="panel-head">
        <span className="micro-label">Tasks</span>
        <span className="micro-label mono">{tasks.length ? `${open.length} open · ${finished.length} done` : ""}</span>
      </div>
      {loadError ? (
        <p className="empty">The tasks couldn&apos;t be loaded</p>
      ) : ordered.length ? (
        <ul className="rows">
          {ordered.map((task) => {
            const due = dueState(task, today);
            return (
              <li key={task.id} className="planner-event-task" data-finished={task.completedAt ? "" : undefined}>
                <span className="micro-label planner-event-task-board">{TASK_BOARD_LABELS[task.board]}</span>
                <span className={statusTag(task.board, task.status)}>{TASK_STATUS_LABELS[task.status]}</span>
                <span className="planner-event-task-title">{task.title}</span>
                {due && <span className={DUE_TAG[due.tone]}>{due.label}</span>}
                {task.docUrl && (
                  <a href={task.docUrl} target="_blank" rel="noreferrer" className="planner-task-doc small">
                    <FileText size={14} aria-hidden="true" />
                    Open document
                  </a>
                )}
                <span className="muted small">{names.get(task.assigneeId) ?? "Former member"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">Nothing planned for this event yet</p>
      )}
      <div className="planner-event-tasks-foot">
        <Link href={boardEventHref("events", eventId)} className="button small ghost">
          Events board
        </Link>
        <Link href={boardEventHref("documents", eventId)} className="button small ghost">
          Documents board
        </Link>
        {canEdit && (
          <>
            <Link href={addTaskHref("events", eventId)} className="button small">
              <Plus size={14} aria-hidden="true" />
              Add a task
            </Link>
            <Link href={addTaskHref("documents", eventId)} className="button small">
              <Plus size={14} aria-hidden="true" />
              Add a document
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
