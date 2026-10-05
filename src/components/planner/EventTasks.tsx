import Link from "next/link";
import { Plus } from "lucide-react";
import { listCommittee } from "@/lib/plan";
import { londonDayKey } from "@/lib/planTime";
import { listTasks } from "@/lib/tasks";
import { TASK_STATUS_LABELS, type CommitteeMember, type Task } from "@/lib/types";
import { addTaskHref, columns, DUE_TAG, dueState } from "./format";
import "./planner.css";

const STATUS_TAG = { todo: "tag", doing: "tag info", done: "tag ok" } as const;

/**
 * The Tasks panel on an event's page: what's left to do for it, with a way
 * into the planner to add more. Server Component; a failure to load hides
 * nothing else on the page.
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
  const board = columns(tasks);
  const ordered = [...board.doing, ...board.todo, ...board.done];
  const open = board.todo.length + board.doing.length;

  return (
    <div className="panel flush">
      <div className="panel-head">
        <span className="micro-label">Tasks</span>
        <span className="micro-label mono">
          {tasks.length ? `${open} open · ${board.done.length} done` : ""}
        </span>
      </div>
      {loadError ? (
        <p className="empty">The tasks couldn&apos;t be loaded</p>
      ) : ordered.length ? (
        <ul className="rows">
          {ordered.map((task) => {
            const due = dueState(task, today);
            return (
              <li key={task.id} className="planner-event-task" data-status={task.status}>
                <span className={STATUS_TAG[task.status]}>{TASK_STATUS_LABELS[task.status]}</span>
                <span className="planner-event-task-title">{task.title}</span>
                {due && <span className={DUE_TAG[due.tone]}>{due.label}</span>}
                <span className="muted small">
                  {task.assigneeId ? (names.get(task.assigneeId) ?? "Former member") : "No one yet"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">No tasks for this event yet</p>
      )}
      <div className="planner-event-tasks-foot">
        <Link href={`/portal/planner?event=${eventId}`} className="button small ghost">
          Open in the planner
        </Link>
        {canEdit && (
          <Link href={addTaskHref(eventId)} className="button small">
            <Plus size={14} aria-hidden="true" />
            Add a task
          </Link>
        )}
      </div>
    </div>
  );
}
