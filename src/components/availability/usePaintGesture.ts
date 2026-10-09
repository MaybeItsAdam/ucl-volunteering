"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cellKey, rectangle, type CellRef, type PaintMode } from "./grid";

/** How long a finger has to rest on a cell before a drag paints instead of scrolling. */
const LONG_PRESS_MS = 380;
/** A finger that moves further than this before then is scrolling. */
const SLOP_PX = 10;

type Gesture =
  | { kind: "pending"; pointerId: number; x: number; y: number; cell: CellRef; mode: PaintMode; timer: number }
  | { kind: "paint"; pointerId: number; anchor: CellRef; current: CellRef; mode: PaintMode };

/** The cell under a point, if it is one of this grid's. */
function cellAt(grid: HTMLElement | null, x: number, y: number): CellRef | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
  if (!el || !grid?.contains(el)) return null;
  return { weekday: Number(el.dataset.weekday), minute: Number(el.dataset.minute) };
}

/**
 * Painting a grid of `[data-cell]` buttons (each with `data-weekday` and
 * `data-minute`) with a pointer.
 *
 * A mouse or pen paints by dragging: the drag sweeps a rectangle, in the mode
 * `modeAt` gives the cell it starts on. A finger taps a cell to toggle it, and
 * rests on a cell before dragging to paint, so an ordinary swipe still
 * scrolls the page. `onPaint` hears each finished stroke; `preview` is the
 * stroke in progress, to draw.
 */
export function usePaintGesture({
  days,
  modeAt,
  onPaint,
  onCellDown,
}: {
  days: readonly number[];
  modeAt: (key: string) => PaintMode;
  onPaint: (keys: string[], mode: PaintMode) => void;
  onCellDown?: (key: string) => void;
}) {
  const [preview, setPreview] = useState<{ keys: Set<string>; mode: PaintMode } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

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

  // A pending long-press timer must not outlive the grid.
  useEffect(
    () => () => {
      const g = gesture.current;
      if (g?.kind === "pending") window.clearTimeout(g.timer);
    },
    [],
  );

  function startPainting(pointerId: number, cell: CellRef, mode: PaintMode) {
    gesture.current = { kind: "paint", pointerId, anchor: cell, current: cell, mode };
    setPreview({ keys: new Set(rectangle(cell, cell, days)), mode });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current) return;
    const el = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!el) return;
    const cell = { weekday: Number(el.dataset.weekday), minute: Number(el.dataset.minute) };
    const key = cellKey(cell.weekday, cell.minute);
    const mode = modeAt(key);
    onCellDown?.(key);

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
      onPaint([cellKey(g.cell.weekday, g.cell.minute)], g.mode);
      return;
    }
    onPaint(rectangle(g.anchor, g.current, days), g.mode);
    setPreview(null);
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.kind === "pending") window.clearTimeout(g.timer);
    gesture.current = null;
    setPreview(null);
  }

  return {
    grid,
    preview,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    },
  };
}
