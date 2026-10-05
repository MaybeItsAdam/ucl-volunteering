"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { formatMinute } from "@/lib/planTime";
import type { AvailabilityBlock, CommitteeMember } from "@/lib/types";
import {
  applyPaint,
  blocksSignature,
  blocksToCells,
  cellKey,
  cellsToBlocks,
  hasCellsOutside,
  modeFor,
  parseCellKey,
  rectangle,
  runAt,
  setNote,
  slotsIn,
  weekdayLong,
  weekdayShort,
  SLOT_MINUTES,
  type BlockInput,
  type CellRef,
  type MinuteRange,
  type PaintMode,
} from "./grid";

/** How long a finger has to rest on a cell before a drag paints instead of scrolling. */
const LONG_PRESS_MS = 380;
/** A finger that moves further than this before then is scrolling. */
const SLOP_PX = 10;

/** Matches the breakpoint in availability.css below which the editor shows one day. */
const ONE_DAY_QUERY = "(max-width: 768px)";

const NOTE_SUGGESTIONS = ["Lecture", "Seminar", "Lab", "Work", "Sport", "Travel"];

type Gesture =
  | { kind: "pending"; pointerId: number; x: number; y: number; cell: CellRef; mode: PaintMode; timer: number }
  | { kind: "paint"; pointerId: number; anchor: CellRef; current: CellRef; mode: PaintMode };

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const blockLabel = (b: Pick<BlockInput, "weekday" | "startMinute" | "endMinute">) =>
  `${weekdayShort(b.weekday)} ${formatMinute(b.startMinute)}–${formatMinute(b.endMinute)}`;

/** The cell under a point, if it is one of this grid's. */
function cellAt(grid: HTMLElement | null, x: number, y: number): CellRef | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
  if (!el || !grid?.contains(el)) return null;
  return { weekday: Number(el.dataset.weekday), minute: Number(el.dataset.minute) };
}

/**
 * "Your week": the signed-in member's own weekly unavailability, painted onto
 * a grid of half-hours and saved as blocks.
 *
 * A mouse or pen paints by dragging: start on a free cell to mark, on a marked
 * one to clear, and the drag sweeps a rectangle. A finger taps a cell to
 * toggle it, and rests on a cell before dragging to paint, so an ordinary
 * swipe still scrolls the page. The keyboard moves with the arrows and
 * toggles with Space or Enter.
 */
export function WeekEditor({
  me,
  initialBlocks,
  days,
  range,
  canSave,
  onSaved,
}: {
  me: CommitteeMember;
  initialBlocks: readonly BlockInput[];
  days: readonly number[];
  range: MinuteRange;
  /** False when there is no database to save to: the grid still works, Save does not. */
  canSave: boolean;
  onSaved: (blocks: AvailabilityBlock[]) => void;
}) {
  const [cells, setCells] = useState(() => blocksToCells(initialBlocks));
  // What the server holds, as of the last load or save: "Undo changes" goes back to it.
  const [savedBlocks, setSavedBlocks] = useState<readonly BlockInput[]>(initialBlocks);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [preview, setPreview] = useState<{ keys: Set<string>; mode: PaintMode } | null>(null);
  const [chosenDay, setChosenDay] = useState(days[0]);
  const [focusKey, setFocusKey] = useState(() => cellKey(days[0], range.start));
  const [editing, setEditing] = useState<BlockInput | null>(null);

  const grid = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const slots = useMemo(() => slotsIn(range), [range]);
  const blocks = useMemo(() => cellsToBlocks(cells), [cells]);
  const baseline = useMemo(() => blocksSignature(savedBlocks), [savedBlocks]);
  const dirty = useMemo(() => blocksSignature(blocks) !== baseline, [blocks, baseline]);
  const hidden = useMemo(() => hasCellsOutside(cells, days, range), [cells, days, range]);
  const activeDay = days.includes(chosenDay) ? chosenDay : days[0];
  // The one cell the Tab key lands on; back to the top-left if the view moved away from it.
  const tabKey = (() => {
    const { weekday, minute } = parseCellKey(focusKey);
    return days.includes(weekday) && minute >= range.start && minute < range.end ? focusKey : cellKey(activeDay, range.start);
  })();

  // While painting with a finger, the page must not scroll under it. Only a
  // non-passive native listener can stop that, so it is bound by hand.
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const onTouchMove = (event: TouchEvent) => {
      if (gesture.current?.kind === "paint" && event.cancelable) event.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // A pending long-press timer must not outlive the editor.
  useEffect(
    () => () => {
      const g = gesture.current;
      if (g?.kind === "pending") window.clearTimeout(g.timer);
    },
    [],
  );

  function edit(next: Map<string, string | null>) {
    setCells(next);
    if (save.kind !== "saving") setSave({ kind: "idle" });
  }

  function startPainting(pointerId: number, cell: CellRef, mode: PaintMode) {
    gesture.current = { kind: "paint", pointerId, anchor: cell, current: cell, mode };
    setPreview({ keys: new Set(rectangle(cell, cell, days)), mode });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current) return;
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!el) return;
    const cell = { weekday: Number(el.dataset.weekday), minute: Number(el.dataset.minute) };
    const mode = modeFor(cells, cellKey(cell.weekday, cell.minute));
    setFocusKey(cellKey(cell.weekday, cell.minute));

    if (event.pointerType === "touch") {
      const { pointerId, clientX: x, clientY: y } = event;
      const timer = window.setTimeout(() => {
        const g = gesture.current;
        if (g?.kind !== "pending" || g.pointerId !== pointerId) return;
        navigator.vibrate?.(8);
        startPainting(pointerId, cell, mode);
      }, LONG_PRESS_MS);
      gesture.current = { kind: "pending", pointerId, x, y, cell, mode, timer };
      return;
    }

    // Mouse and pen: no text selection, and keep hearing the pointer if it
    // leaves the grid mid-drag.
    event.preventDefault();
    grid.current?.setPointerCapture(event.pointerId);
    startPainting(event.pointerId, cell, mode);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.kind === "pending") {
      if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > SLOP_PX) {
        window.clearTimeout(g.timer);
        gesture.current = null;
      }
      return;
    }
    const cell = cellAt(grid.current, event.clientX, event.clientY);
    if (!cell || (cell.weekday === g.current.weekday && cell.minute === g.current.minute)) return;
    g.current = cell;
    setPreview({ keys: new Set(rectangle(g.anchor, cell, days)), mode: g.mode });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (g.kind === "pending") {
      // A tap: toggle the one cell.
      window.clearTimeout(g.timer);
      edit(applyPaint(cells, [cellKey(g.cell.weekday, g.cell.minute)], g.mode));
      return;
    }
    edit(applyPaint(cells, rectangle(g.anchor, g.current, days), g.mode));
    setPreview(null);
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.kind === "pending") window.clearTimeout(g.timer);
    gesture.current = null;
    setPreview(null);
  }

  function toggle(weekday: number, minute: number) {
    const key = cellKey(weekday, minute);
    edit(applyPaint(cells, [key], modeFor(cells, key)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!el) return;
    const weekday = Number(el.dataset.weekday);
    const minute = Number(el.dataset.minute);
    // On a phone only one day is on screen; elsewhere, all of `days`.
    const visible = window.matchMedia(ONE_DAY_QUERY).matches ? [activeDay] : days;
    let d = visible.indexOf(weekday);
    let m = minute;
    switch (event.key) {
      case "ArrowUp": m -= SLOT_MINUTES; break;
      case "ArrowDown": m += SLOT_MINUTES; break;
      case "ArrowLeft": d -= 1; break;
      case "ArrowRight": d += 1; break;
      case "Home": m = range.start; break;
      case "End": m = range.end - SLOT_MINUTES; break;
      default: return;
    }
    event.preventDefault();
    if (d < 0 || d >= visible.length || m < range.start || m >= range.end) return;
    const key = cellKey(visible[d], m);
    setFocusKey(key);
    grid.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
  }

  async function onSave() {
    setSave({ kind: "saving" });
    try {
      const res = await fetch("/api/plan/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const body = (await res.json().catch(() => null)) as { blocks?: AvailabilityBlock[]; error?: string } | null;
      if (!res.ok || !body?.blocks) {
        setSave({ kind: "error", message: body?.error ?? `Saving failed (${res.status})` });
        return;
      }
      setSavedBlocks(body.blocks);
      setSave({ kind: "saved" });
      onSaved(body.blocks);
    } catch {
      setSave({ kind: "error", message: "Could not reach the server — check your connection and try again" });
    }
  }

  function revert() {
    setCells(blocksToCells(savedBlocks));
    setSave({ kind: "idle" });
  }

  const shown = (key: string) => (preview?.keys.has(key) ? preview.mode === "paint" : cells.has(key));
  const noteOf = (weekday: number, minute: number) => (cells.get(cellKey(weekday, minute)) ?? null);
  const sameRun = (weekday: number, a: number, b: number) =>
    shown(cellKey(weekday, a)) && shown(cellKey(weekday, b)) && noteOf(weekday, a) === noteOf(weekday, b);

  return (
    <section className="panel flush avail-editor" aria-labelledby="avail-editor-title" data-colour={me.colour ?? "purple"}>
      <header className="panel-head avail-panel-head">
        <div>
          <h2 id="avail-editor-title" className="micro-label">Your week</h2>
          <p className="small muted avail-help">
            <span className="avail-help-fine">Drag across the times you can&rsquo;t make — start on a marked cell to clear</span>
            <span className="avail-help-coarse">Tap a time to mark it — hold, then drag, to mark several</span>
          </p>
        </div>
        <div className="avail-save">
          {dirty ? (
            <span className="tag warn">Unsaved</span>
          ) : save.kind === "saved" ? (
            <span className="tag ok" role="status">Saved</span>
          ) : null}
          {dirty && (
            <button type="button" className="button ghost small" onClick={revert} disabled={save.kind === "saving"}>
              Undo changes
            </button>
          )}
          <button
            type="button"
            className="button small"
            onClick={() => edit(new Map())}
            disabled={!cells.size || save.kind === "saving"}
          >
            Clear week
          </button>
          <button
            type="button"
            className="button primary small"
            onClick={onSave}
            disabled={!canSave || !dirty || save.kind === "saving"}
          >
            {save.kind === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {save.kind === "error" && (
        <div className="notice bad avail-inline-notice" role="alert">
          <strong>Not saved</strong>
          <p>{save.message}</p>
        </div>
      )}
      {hidden && (
        <p className="small muted avail-hidden-note">
          Some of your marked times are outside the hours or days shown — they are kept, widen the view to see them
        </p>
      )}

      <div className="subnav avail-daytabs" role="tablist" aria-label="Day">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === activeDay}
            onClick={() => setChosenDay(d)}
          >
            {weekdayShort(d)}
          </button>
        ))}
      </div>

      <div
        ref={grid}
        className={`avail-grid avail-grid-edit${preview ? " is-painting" : ""}`}
        style={{ "--avail-days": days.length } as CSSProperties}
        role="grid"
        aria-label="Your weekly unavailability"
        data-no-swipe
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
      >
        <div role="row" className="avail-row avail-row-head">
          <span className="avail-corner" aria-hidden />
          {days.map((d) => (
            <span key={d} role="columnheader" className={`avail-dayhead micro-label${d === activeDay ? "" : " avail-offday"}`}>
              <span className="avail-day-short">{weekdayShort(d)}</span>
              <span className="avail-day-long">{weekdayLong(d)}</span>
            </span>
          ))}
        </div>
        {slots.map((minute) => (
          <div role="row" key={minute} className={`avail-row${minute % 60 === 0 ? " is-hour" : ""}`}>
            <span role="rowheader" className="avail-time">
              {minute % 60 === 0 ? formatMinute(minute) : <span className="sr-only">{formatMinute(minute)}</span>}
            </span>
            {days.map((weekday) => {
              const key = cellKey(weekday, minute);
              const on = shown(key);
              const note = on ? noteOf(weekday, minute) : null;
              const runStart = on && !sameRun(weekday, minute - SLOT_MINUTES, minute);
              const runEnd = on && !sameRun(weekday, minute, minute + SLOT_MINUTES);
              const previewing = preview?.keys.has(key) ?? false;
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  tabIndex={key === tabKey ? 0 : -1}
                  aria-selected={on}
                  aria-label={`${weekdayLong(weekday)} ${formatMinute(minute)} to ${formatMinute(minute + SLOT_MINUTES)}: ${
                    on ? `unavailable${note ? `, ${note}` : ""}` : "free"
                  }`}
                  className={`avail-cell${weekday === activeDay ? "" : " avail-offday"}`}
                  data-cell
                  data-key={key}
                  data-weekday={weekday}
                  data-minute={minute}
                  data-on={on || undefined}
                  data-run-start={runStart || undefined}
                  data-run-end={runEnd || undefined}
                  data-preview={previewing ? preview?.mode : undefined}
                  onFocus={() => setFocusKey(key)}
                  onClick={(event) => {
                    // Pointers are handled above; this is the keyboard's Space and Enter.
                    if (event.detail === 0) toggle(weekday, minute);
                  }}
                >
                  {runStart && note && <span className="avail-cell-note">{note}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="avail-blocks">
        <span className="micro-label">Marked</span>
        {blocks.length ? (
          <ul className="avail-block-list">
            {blocks.map((b) => (
              <li key={`${b.weekday}:${b.startMinute}`}>
                <span className="mono avail-block-time">{blockLabel(b)}</span>
                <span className={b.note ? "avail-block-note" : "avail-block-note dim"}>{b.note ?? "No note"}</span>
                <button type="button" className="button ghost small" onClick={() => setEditing(runAt(cells, b.weekday, b.startMinute))}>
                  {b.note ? "Edit" : "Add note"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">Nothing marked: you&rsquo;re free all week</p>
        )}
      </div>

      {editing && (
        <NoteSheet
          block={editing}
          onClose={() => setEditing(null)}
          onSave={(note) => {
            edit(setNote(cells, editing, note));
            setEditing(null);
          }}
          onRemove={() => {
            const keys = slotsIn({ start: editing.startMinute, end: editing.endMinute }).map((m) => cellKey(editing.weekday, m));
            edit(applyPaint(cells, keys, "erase"));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function NoteSheet({
  block,
  onClose,
  onSave,
  onRemove,
}: {
  block: BlockInput;
  onClose: () => void;
  onSave: (note: string | null) => void;
  onRemove: () => void;
}) {
  const [note, setNoteText] = useState(block.note ?? "");
  return (
    <Sheet onClose={onClose} labelledBy="avail-note-title">
      <div className="sheet-grip" aria-hidden>
        <span className="sheet-handle" />
      </div>
      <h3 id="avail-note-title">{weekdayLong(block.weekday)} <span className="mono">{formatMinute(block.startMinute)}–{formatMinute(block.endMinute)}</span></h3>
      <p>A word on why, if you like — the committee sees it</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(note);
        }}
      >
        <div className="field">
          <label htmlFor="avail-note">Note</label>
          <input
            id="avail-note"
            value={note}
            maxLength={200}
            placeholder="Lecture"
            autoComplete="off"
            onChange={(event) => setNoteText(event.target.value)}
          />
        </div>
        <div className="avail-suggestions" aria-label="Suggestions">
          {NOTE_SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="tag avail-suggestion hit" aria-pressed={note === s} onClick={() => setNoteText(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="button danger" onClick={onRemove}>
            Unmark
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save note
          </button>
        </div>
      </form>
    </Sheet>
  );
}
