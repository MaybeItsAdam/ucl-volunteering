"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, FileText, Plus } from "lucide-react";
import {
  BOARD_STATUSES,
  finalStatus,
  TASK_STATUS_LABELS,
  type CommitteeMember,
  type Task,
  type TaskBoard,
  type TaskStatus,
} from "@/lib/types";
import { initials } from "@/components/plan/format";
import { createTask, patchTask } from "./api";
import {
  columns,
  COLUMN_HINT,
  DUE_TAG,
  dueState,
  EMPTY_COLUMN,
  eventHref,
  eventOptionLabel,
  matches,
  nextStatus,
  type EventOption,
  type TaskFilter,
} from "./format";
import { TaskSheet, type TaskDraft } from "./TaskSheet";
import "./planner.css";

/** Keeps the filter in the address bar, so a reload or a shared link lands on the same view. */
function writeFilter(filter: TaskFilter) {
  const params = new URLSearchParams();
  if (filter.mine) params.set("mine", "1");
  if (filter.event !== "all") params.set("event", filter.event);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/**
 * One planner board as columns: Backlog → Planned → Ready to post → Content →
 * Done for events, Backlog → Drafting → In review → Submitted → Approved for
 * documents. Every column side by side on a wide screen; on a phone one at a
 * time, picked with a switch. Filtered to everyone's or mine, and to actions
 * or one event. Each card's button moves it one column on; tap the title to
 * edit it (or move it back) in a sheet.
 */
export function PlannerBoard({
  board,
  tasks: initialTasks,
  committee,
  events,
  myId,
  canEdit,
  today,
  initialFilter,
  openNew,
}: {
  board: TaskBoard;
  /** This board's items. */
  tasks: Task[];
  committee: CommitteeMember[];
  /** Events an item can be linked to. */
  events: EventOption[];
  myId: string;
  canEdit: boolean;
  /** London day key, from the server so the due tags match its render. */
  today: string;
  initialFilter: TaskFilter;
  /** Open the add sheet at once (from an event's "Add"). */
  openNew: boolean;
}) {
  // Re-seed when the server sends a fresh list.
  const [seen, setSeen] = useState(initialTasks);
  const [tasks, setTasks] = useState(initialTasks);
  if (seen !== initialTasks) {
    setSeen(initialTasks);
    setTasks(initialTasks);
  }
  const statuses: readonly TaskStatus[] = BOARD_STATUSES[board];
  const [filter, setFilter] = useState(initialFilter);
  const [column, setColumn] = useState<TaskStatus>("backlog");
  const [editing, setEditing] = useState<Task | "new" | null>(openNew && canEdit ? "new" : null);
  const [quick, setQuick] = useState("");
  const [quickWho, setQuickWho] = useState(myId);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = new Map(committee.map((m) => [m.id, m]));
  const draftEvent = filter.event !== "all" && filter.event !== "actions" ? filter.event : null;
  const draft: TaskDraft = { board, eventId: draftEvent, assigneeId: myId };
  const noun = board === "documents" ? "document" : "item";

  // Events to filter by: the ones with items, plus every event that can take one.
  const eventChoices = new Map<string, EventOption>();
  for (const t of tasks) if (t.event) eventChoices.set(t.event.id, t.event);
  for (const e of events) eventChoices.set(e.id, e);
  const eventList = [...eventChoices.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const filteredEvent = eventChoices.get(filter.event) ?? null;

  const cols = columns(board, tasks.filter((t) => matches(t, filter, myId)));

  function changeFilter(next: TaskFilter) {
    setFilter(next);
    writeFilter(next);
  }

  // Drops a `new=1` that opened the sheet, so a reload doesn't open it again.
  function closeSheet() {
    setEditing(null);
    writeFilter(filter);
  }

  /** Put a saved item in place (or add it), keeping the rest; one moved to the other board leaves this one. */
  function upsert(task: Task) {
    setTasks((all) => {
      const rest = all.filter((t) => t.id !== task.id);
      if (task.board !== board) return rest;
      return all.some((t) => t.id === task.id) ? all.map((t) => (t.id === task.id ? task : t)) : [...all, task];
    });
  }

  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    const title = quick.trim();
    if (!title || !quickWho) return;
    setAdding(true);
    setError(null);
    try {
      upsert(await createTask({ board, title, eventId: draftEvent, assigneeId: quickWho }));
      setQuick("");
      setColumn("backlog");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't add the ${noun}`);
    } finally {
      setAdding(false);
    }
  }

  async function advance(task: Task, to: TaskStatus) {
    setError(null);
    upsert({ ...task, status: to, completedAt: to === finalStatus(board) ? new Date().toISOString() : null });
    try {
      upsert(await patchTask(task.id, { status: to }));
    } catch (err) {
      upsert(task);
      setError(err instanceof Error ? err.message : `Couldn't move the ${noun}`);
    }
  }

  return (
    <div className="planner">
      <div className="planner-toolbar">
        <div className="segmented" role="group" aria-label="Whose items">
          <button type="button" aria-pressed={!filter.mine} onClick={() => changeFilter({ ...filter, mine: false })}>
            Everyone
          </button>
          <button type="button" aria-pressed={filter.mine} onClick={() => changeFilter({ ...filter, mine: true })}>
            Mine
          </button>
        </div>
        <label className="planner-event-filter">
          <span className="sr-only">Actions or an event</span>
          <select className="input" value={filter.event} onChange={(e) => changeFilter({ ...filter, event: e.target.value })}>
            <option value="all">Actions and events</option>
            <option value="actions">Actions only</option>
            <optgroup label="Linked to an event">
              {eventList.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {eventOptionLabel(ev)}
                </option>
              ))}
            </optgroup>
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
            {board === "documents" ? "New document" : "New item"}
          </label>
          <input
            id="planner-quick"
            className="input"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            maxLength={200}
            placeholder={
              filteredEvent
                ? `Add to ${filteredEvent.title}`
                : board === "documents"
                  ? "Add a document, e.g. risk assessment"
                  : "Add an action"
            }
            autoComplete="off"
          />
          <label htmlFor="planner-quick-who" className="sr-only">
            Who owns it
          </label>
          <select
            id="planner-quick-who"
            className="input planner-quick-who"
            value={quickWho}
            onChange={(e) => setQuickWho(e.target.value)}
            required
          >
            {!committee.some((m) => m.id === myId) && <option value={myId}>You</option>}
            {committee.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === myId ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
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
        {statuses.map((s) => (
          <button key={s} type="button" aria-pressed={column === s} onClick={() => setColumn(s)}>
            {TASK_STATUS_LABELS[s]}
            <span className="mono planner-count">{cols[s].length}</span>
          </button>
        ))}
      </div>

      <div className="planner-board" data-board={board}>
        {statuses.map((status) => (
          <section
            key={status}
            className="panel flush planner-column"
            data-active={column === status ? "" : undefined}
            aria-label={TASK_STATUS_LABELS[status]}
          >
            <div className="panel-head">
              <span className="micro-label">{TASK_STATUS_LABELS[status]}</span>
              <span className="micro-label mono">{cols[status].length}</span>
            </div>
            {COLUMN_HINT[status] && <p className="planner-column-hint small muted">{COLUMN_HINT[status]}</p>}
            {cols[status].length ? (
              <ul className="rows">
                {cols[status].map((task) => {
                  const due = dueState(task, today);
                  const who = names.get(task.assigneeId);
                  const next = nextStatus(board, task.status);
                  return (
                    <li key={task.id} className="planner-task" data-finished={task.completedAt ? "" : undefined}>
                      <button type="button" className="planner-task-title" onClick={() => setEditing(task)}>
                        {task.title}
                      </button>
                      <div className="planner-task-meta">
                        {task.event ? (
                          filter.event !== task.event.id && (
                            <Link href={eventHref(task.event.id)} className="planner-task-event small">
                              {eventOptionLabel(task.event)}
                            </Link>
                          )
                        ) : (
                          <span className="tag">Action</span>
                        )}
                        {due && <span className={DUE_TAG[due.tone]}>{due.label}</span>}
                        {task.docUrl && (
                          <a href={task.docUrl} target="_blank" rel="noreferrer" className="planner-task-doc small">
                            <FileText size={14} aria-hidden="true" />
                            Open document
                          </a>
                        )}
                      </div>
                      <div className="planner-task-foot">
                        <span className="planner-task-who small">
                          <span className="avatar" data-colour={who?.colour ?? undefined} aria-hidden="true">
                            {who ? initials(who.name) : "?"}
                          </span>
                          {task.assigneeId === myId ? "You" : (who?.name ?? "Former member")}
                        </span>
                        {canEdit && next && (
                          <button
                            type="button"
                            className="button small"
                            onClick={() => advance(task, next)}
                            aria-label={`Move ${task.title} to ${TASK_STATUS_LABELS[next]}`}
                          >
                            {TASK_STATUS_LABELS[next]}
                            <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">{EMPTY_COLUMN[status]}</p>
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
            if (task.board === board) setColumn(task.status);
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
