"use client";

import { useId, useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import {
  BOARD_STATUSES,
  isBoardStatus,
  TASK_BOARDS,
  TASK_BOARD_LABELS,
  TASK_STATUS_LABELS,
  type CommitteeMember,
  type Task,
  type TaskBoard,
  type TaskStatus,
} from "@/lib/types";
import { createTask, deleteTask, patchTask } from "./api";
import { COLUMN_HINT, eventOptionLabel, type EventOption } from "./format";

/** What a new item starts with: the board it's added on, the event the board is filtered to, and its owner (you by default). */
export interface TaskDraft {
  board: TaskBoard;
  eventId: string | null;
  assigneeId: string;
}

interface FormState {
  board: TaskBoard;
  title: string;
  notes: string;
  status: TaskStatus;
  assigneeId: string;
  dueOn: string;
  eventId: string;
  docUrl: string;
}

function toForm(task: Task | null, draft: TaskDraft): FormState {
  return {
    board: task?.board ?? draft.board,
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    status: task?.status ?? "backlog",
    assigneeId: task?.assigneeId ?? draft.assigneeId,
    dueOn: task?.dueOn ?? "",
    eventId: task?.eventId ?? draft.eventId ?? "",
    docUrl: task?.docUrl ?? "",
  };
}

const nullable = (v: string) => (v.trim() ? v.trim() : null);

/** The POST body, or for an existing item the PATCH body of only what changed. */
function body(task: Task | null, before: FormState, form: FormState): Record<string, unknown> {
  if (!form.title.trim()) throw new Error("Give it a title");
  if (!form.assigneeId) throw new Error("Pick someone on the committee to own it");
  const out: Record<string, unknown> = {};
  const set = (key: string, now: unknown, was: unknown) => {
    if (!task || now !== was) out[key] = now;
  };
  set("board", form.board, before.board);
  set("title", form.title.trim(), before.title);
  set("notes", nullable(form.notes), nullable(before.notes));
  set("status", form.status, before.status);
  set("assigneeId", form.assigneeId, before.assigneeId);
  set("dueOn", nullable(form.dueOn), nullable(before.dueOn));
  set("eventId", nullable(form.eventId), nullable(before.eventId));
  set("docUrl", nullable(form.docUrl), nullable(before.docUrl));
  // A board move always carries its column, so the server never has to guess.
  if (task && out.board !== undefined) out.status = form.status;
  return out;
}

/**
 * Add or edit one planner item: title, board and column, who owns it, when
 * it's due, the event it's for (or none: an action), a document link and
 * notes. A bottom sheet on a phone. Without `canEdit` it's a read-only view.
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
  /** Null to add a new item. */
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

  // Switching board keeps the column if the new board has it (Backlog), else starts in Backlog.
  const setBoard = (board: TaskBoard) =>
    setForm((f) => ({ ...f, board, status: isBoardStatus(board, f.status) ? f.status : "backlog" }));

  // The item's own event stays pickable even once it's past and off the list.
  const options = [...events];
  if (task?.event && !options.some((e) => e.id === task.event!.id)) options.unshift(task.event);
  const assigneeGone = form.assigneeId && !committee.some((m) => m.id === form.assigneeId);
  const showDocUrl = form.board === "documents" || Boolean(initial.docUrl);
  const noun = form.board === "documents" ? "document" : "item";

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
        <h3 id={`${id}-head`}>{task ? (canEdit ? `Edit ${noun}` : task.title) : `New ${noun}`}</h3>
        <fieldset disabled={!canEdit || busy}>
          <div className="field">
            <label htmlFor={`${id}-title`}>Title</label>
            <input
              id={`${id}-title`}
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              maxLength={200}
              placeholder={form.board === "documents" ? "Risk assessment" : "Book the minibus"}
              autoFocus={!task}
            />
          </div>

          <div className="field">
            <span className="micro-label" id={`${id}-board`}>
              Board
            </span>
            <div className="segmented planner-board-switch" role="group" aria-labelledby={`${id}-board`}>
              {TASK_BOARDS.map((b) => (
                <button key={b} type="button" aria-pressed={form.board === b} onClick={() => setBoard(b)}>
                  {TASK_BOARD_LABELS[b]}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-status`}>Column</label>
              <select id={`${id}-status`} value={form.status} onChange={(e) => update("status", e.target.value as TaskStatus)}>
                {BOARD_STATUSES[form.board].map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              {COLUMN_HINT[form.status] && <span className="hint">{COLUMN_HINT[form.status]}</span>}
            </div>
            <div className="field">
              <label htmlFor={`${id}-who`}>Who owns it</label>
              <select
                id={`${id}-who`}
                value={form.assigneeId}
                onChange={(e) => update("assigneeId", e.target.value)}
                required
                aria-required="true"
              >
                {!form.assigneeId && (
                  <option value="" disabled>
                    Pick someone
                  </option>
                )}
                {assigneeGone && <option value={form.assigneeId}>Former member</option>}
                {committee.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {assigneeGone && <span className="hint">They&apos;ve left the committee, so hand this on</span>}
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${id}-event`}>Event</label>
            <select id={`${id}-event`} value={form.eventId} onChange={(e) => update("eventId", e.target.value)}>
              <option value="">None, it&apos;s an action</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {eventOptionLabel(o)}
                </option>
              ))}
            </select>
            <span className="hint">Events from the last week and the next four months are listed</span>
          </div>

          <div className="field">
            <label htmlFor={`${id}-due`}>Due</label>
            <input id={`${id}-due`} type="date" value={form.dueOn} onChange={(e) => update("dueOn", e.target.value)} />
          </div>

          {showDocUrl && (
            <div className="field">
              <label htmlFor={`${id}-doc`}>Document link</label>
              <input
                id={`${id}-doc`}
                type="url"
                inputMode="url"
                value={form.docUrl}
                onChange={(e) => update("docUrl", e.target.value)}
                placeholder="https://"
                maxLength={2000}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor={`${id}-notes`}>Notes</label>
            <textarea id={`${id}-notes`} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </div>
        </fieldset>

        {task?.docUrl && (
          <p className="planner-sheet-doc">
            <a href={task.docUrl} target="_blank" rel="noreferrer">
              Open document
            </a>
          </p>
        )}

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
              {busy ? "Saving…" : task ? "Save" : `Add ${noun}`}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
