"use client";

import { useId, useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { TASK_STATUSES, TASK_STATUS_LABELS, type CommitteeMember, type Task, type TaskStatus } from "@/lib/types";
import { createTask, deleteTask, patchTask } from "./api";
import { eventOptionLabel, type EventOption } from "./format";

/** What a new task starts with: the event and assignee the board is filtered to. */
export interface TaskDraft {
  eventId: string | null;
  assigneeId: string | null;
}

interface FormState {
  title: string;
  notes: string;
  status: TaskStatus;
  assigneeId: string;
  dueOn: string;
  eventId: string;
}

function toForm(task: Task | null, draft: TaskDraft): FormState {
  return {
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    status: task?.status ?? "todo",
    assigneeId: task?.assigneeId ?? draft.assigneeId ?? "",
    dueOn: task?.dueOn ?? "",
    eventId: task?.eventId ?? draft.eventId ?? "",
  };
}

const nullable = (v: string) => (v.trim() ? v.trim() : null);

/** The POST body, or for an existing task the PATCH body of only what changed. */
function body(task: Task | null, before: FormState, form: FormState): Record<string, unknown> {
  if (!form.title.trim()) throw new Error("Give it a title");
  const out: Record<string, unknown> = {};
  const set = (key: string, now: unknown, was: unknown) => {
    if (!task || now !== was) out[key] = now;
  };
  set("title", form.title.trim(), before.title);
  set("notes", nullable(form.notes), nullable(before.notes));
  set("status", form.status, before.status);
  set("assigneeId", nullable(form.assigneeId), nullable(before.assigneeId));
  set("dueOn", nullable(form.dueOn), nullable(before.dueOn));
  set("eventId", nullable(form.eventId), nullable(before.eventId));
  return out;
}

/**
 * Add or edit one task: title, status, who, when, which event, notes. A
 * bottom sheet on a phone. Without `canEdit` it's a read-only view.
 */
export function TaskSheet({
  task,
  draft,
  committee,
  events,
  canEdit,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** Null to add a new task. */
  task: Task | null;
  draft: TaskDraft;
  committee: CommitteeMember[];
  events: EventOption[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const [initial] = useState(() => toForm(task, draft));
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // The task's own event stays pickable even once it's past and off the list.
  const options = [...events];
  if (task?.event && !options.some((e) => e.id === task.event!.id)) options.unshift(task.event);
  const assigneeGone = form.assigneeId && !committee.some((m) => m.id === form.assigneeId);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let payload: Record<string, unknown>;
    try {
      payload = body(task, initial, form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check the form");
      return;
    }
    if (task && !Object.keys(payload).length) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      onSaved(task ? await patchTask(task.id, payload) : await createTask(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setBusy(false);
    }
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTask(task.id);
      onDeleted(task.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy={`${id}-head`}>
      <form onSubmit={save} noValidate className="planner-sheet">
        <h3 id={`${id}-head`}>{task ? (canEdit ? "Edit task" : task.title) : "New task"}</h3>
        <fieldset disabled={!canEdit || busy}>
          <div className="field">
            <label htmlFor={`${id}-title`}>Title</label>
            <input
              id={`${id}-title`}
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              maxLength={200}
              placeholder="Book the minibus"
              autoFocus={!task}
            />
          </div>

          <div className="field">
            <span className="micro-label" id={`${id}-status`}>
              Status
            </span>
            <div className="segmented planner-status-switch" role="group" aria-labelledby={`${id}-status`}>
              {TASK_STATUSES.map((s) => (
                <button key={s} type="button" aria-pressed={form.status === s} onClick={() => update("status", s)}>
                  {TASK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-who`}>Who</label>
              <select id={`${id}-who`} value={form.assigneeId} onChange={(e) => update("assigneeId", e.target.value)}>
                <option value="">No one yet</option>
                {assigneeGone && <option value={form.assigneeId}>Former member</option>}
                {committee.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-due`}>Due</label>
              <input id={`${id}-due`} type="date" value={form.dueOn} onChange={(e) => update("dueOn", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${id}-event`}>For an event</label>
            <select id={`${id}-event`} value={form.eventId} onChange={(e) => update("eventId", e.target.value)}>
              <option value="">Not for an event</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {eventOptionLabel(o)}
                </option>
              ))}
            </select>
            <span className="hint">Events from the last week and the next four months are listed</span>
          </div>

          <div className="field">
            <label htmlFor={`${id}-notes`}>Notes</label>
            <textarea id={`${id}-notes`} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </div>
        </fieldset>

        {error && (
          <p className="planner-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          {task && canEdit && (
            confirmDelete ? (
              <button type="button" className="button danger" onClick={remove} disabled={busy}>
                Delete for good
              </button>
            ) : (
              <button type="button" className="button danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete
              </button>
            )
          )}
          <span className="planner-sheet-spacer" />
          <button type="button" className="button" onClick={onClose}>
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit && (
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Saving…" : task ? "Save" : "Add task"}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
