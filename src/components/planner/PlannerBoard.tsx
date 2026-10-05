"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { TASK_STATUSES, TASK_STATUS_LABELS, type CommitteeMember, type Task, type TaskStatus } from "@/lib/types";
import { initials } from "@/components/plan/format";
import { createTask, patchTask } from "./api";
import {
  columns,
  DUE_TAG,
  dueState,
  eventHref,
  eventOptionLabel,
  matches,
  NEXT_STATUS,
  type EventOption,
  type TaskFilter,
} from "./format";
import { TaskSheet, type TaskDraft } from "./TaskSheet";
import "./planner.css";

const EMPTY: Record<TaskStatus, string> = {
  todo: "Nothing to do",
  doing: "Nothing in progress",
  done: "Nothing done lately",
};

/** Keeps the filter in the address bar, so a reload or a shared link lands on the same view. */
function writeFilter(filter: TaskFilter) {
  const params = new URLSearchParams();
  if (filter.mine) params.set("mine", "1");
  if (filter.event !== "all") params.set("event", filter.event);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/**
 * The committee's tasks as a board: To do, Doing, Done. Three columns on a
 * wide screen; on a phone one at a time, picked with a switch. Filtered to
 * everyone's or mine, and to one event. Tap a task to edit it in a sheet.
 */
export function PlannerBoard({
  tasks: initialTasks,
  committee,
  events,
  myId,
  canEdit,
  today,
  initialFilter,
  openNew,
}: {
  tasks: Task[];
  committee: CommitteeMember[];
  /** Events a task can be linked to. */
  events: EventOption[];
  myId: string;
  canEdit: boolean;
  /** London day key, from the server so the due tags match its render. */
  today: string;
  initialFilter: TaskFilter;
  /** Open the add sheet at once (from an event's "Add a task"). */
  openNew: boolean;
}) {
  // Re-seed when the server sends a fresh list.
  const [seen, setSeen] = useState(initialTasks);
  const [tasks, setTasks] = useState(initialTasks);
  if (seen !== initialTasks) {
    setSeen(initialTasks);
    setTasks(initialTasks);
  }
  const [filter, setFilter] = useState(initialFilter);
  const [column, setColumn] = useState<TaskStatus>("todo");
  const [editing, setEditing] = useState<Task | "new" | null>(openNew && canEdit ? "new" : null);
  const [quick, setQuick] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = new Map(committee.map((m) => [m.id, m]));
  const draft: TaskDraft = {
    eventId: filter.event !== "all" && filter.event !== "none" ? filter.event : null,
    assigneeId: filter.mine ? myId : null,
  };

  // Events to filter by: the ones with tasks, plus the one filtered to.
  const eventChoices = new Map<string, EventOption>();
  for (const t of tasks) if (t.event) eventChoices.set(t.event.id, t.event);
  const filtered = events.find((e) => e.id === filter.event);
  if (filtered) eventChoices.set(filtered.id, filtered);
  const eventList = [...eventChoices.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const filteredEvent = eventChoices.get(filter.event) ?? null;

  const board = columns(tasks.filter((t) => matches(t, filter, myId)));

  function changeFilter(next: TaskFilter) {
    setFilter(next);
    writeFilter(next);
  }

  // Drops a `new=1` that opened the sheet, so a reload doesn't open it again.
  function closeSheet() {
    setEditing(null);
    writeFilter(filter);
  }

  /** Put a saved task in place (or add it), keeping the rest. */
  function upsert(task: Task) {
    setTasks((all) => (all.some((t) => t.id === task.id) ? all.map((t) => (t.id === task.id ? task : t)) : [...all, task]));
  }

  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    try {
      upsert(await createTask({ title, eventId: draft.eventId, assigneeId: draft.assigneeId }));
      setQuick("");
      setColumn("todo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the task");
    } finally {
      setAdding(false);
    }
  }

  async function advance(task: Task) {
    const to = NEXT_STATUS[task.status].to;
    setError(null);
    upsert({ ...task, status: to, completedAt: to === "done" ? new Date().toISOString() : null });
    try {
      upsert(await patchTask(task.id, { status: to }));
    } catch (err) {
      upsert(task);
      setError(err instanceof Error ? err.message : "Couldn't move the task");
    }
  }

  return (
    <div className="planner">
      <div className="planner-toolbar">
        <div className="segmented" role="group" aria-label="Whose tasks">
          <button type="button" aria-pressed={!filter.mine} onClick={() => changeFilter({ ...filter, mine: false })}>
            Everyone
          </button>
          <button type="button" aria-pressed={filter.mine} onClick={() => changeFilter({ ...filter, mine: true })}>
            Mine
          </button>
        </div>
        <label className="planner-event-filter">
          <span className="sr-only">For an event</span>
          <select className="input" value={filter.event} onChange={(e) => changeFilter({ ...filter, event: e.target.value })}>
            <option value="all">All events and tasks</option>
            <option value="none">Not for an event</option>
            {eventList.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {eventOptionLabel(ev)}
              </option>
            ))}
          </select>
        </label>
        {filteredEvent && (
          <Link href={eventHref(filteredEvent.id)} className="button small ghost">
            Open event
          </Link>
        )}
      </div>

      {canEdit && (
        <form className="planner-quickadd" onSubmit={quickAdd}>
          <label htmlFor="planner-quick" className="sr-only">
            New task
          </label>
          <input
            id="planner-quick"
            className="input"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            maxLength={200}
            placeholder={filteredEvent ? `Add a task for ${filteredEvent.title}` : "Add a task"}
            autoComplete="off"
          />
          <button type="submit" className="button primary" disabled={adding || !quick.trim()}>
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
          <button type="button" className="button" onClick={() => setEditing("new")}>
            More detail
          </button>
        </form>
      )}

      {error && (
        <div className="notice bad" role="alert">
          <strong>That didn&apos;t work</strong>
          <p>{error}</p>
        </div>
      )}

      {/* Phone: one column at a time. */}
      <div className="segmented planner-columns-switch" role="group" aria-label="Column">
        {TASK_STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={column === s} onClick={() => setColumn(s)}>
            {TASK_STATUS_LABELS[s]}
            <span className="mono planner-count">{board[s].length}</span>
          </button>
        ))}
      </div>

      <div className="planner-board">
        {TASK_STATUSES.map((status) => (
          <section
            key={status}
            className="panel flush planner-column"
            data-active={column === status ? "" : undefined}
            aria-label={TASK_STATUS_LABELS[status]}
          >
            <div className="panel-head">
              <span className="micro-label">{TASK_STATUS_LABELS[status]}</span>
              <span className="micro-label mono">{board[status].length}</span>
            </div>
            {board[status].length ? (
              <ul className="rows">
                {board[status].map((task) => {
                  const due = dueState(task, today);
                  const who = task.assigneeId ? names.get(task.assigneeId) : null;
                  return (
                    <li key={task.id} className="planner-task" data-status={task.status}>
                      <div className="planner-task-main">
                        <button type="button" className="planner-task-title" onClick={() => setEditing(task)}>
                          {task.title}
                        </button>
                        <div className="planner-task-meta">
                          {due && <span className={DUE_TAG[due.tone]}>{due.label}</span>}
                          {task.event && filter.event !== task.event.id && (
                            <Link href={eventHref(task.event.id)} className="planner-task-event small">
                              {eventOptionLabel(task.event)}
                            </Link>
                          )}
                          {task.assigneeId && (
                            <span className="planner-task-who small">
                              <span className="avatar" data-colour={who?.colour ?? undefined} aria-hidden="true">
                                {who ? initials(who.name) : "?"}
                              </span>
                              {task.assigneeId === myId ? "You" : (who?.name ?? "Former member")}
                            </span>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          className="button small"
                          onClick={() => advance(task)}
                          aria-label={`${NEXT_STATUS[task.status].label}: ${task.title}`}
                        >
                          {NEXT_STATUS[task.status].label}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">{EMPTY[status]}</p>
            )}
          </section>
        ))}
      </div>

      {editing && (
        <TaskSheet
          task={editing === "new" ? null : editing}
          draft={draft}
          committee={committee}
          events={events}
          canEdit={canEdit}
          onClose={closeSheet}
          onSaved={(task) => {
            upsert(task);
            setColumn(task.status);
            closeSheet();
          }}
          onDeleted={(id) => {
            setTasks((all) => all.filter((t) => t.id !== id));
            closeSheet();
          }}
        />
      )}
    </div>
  );
}
