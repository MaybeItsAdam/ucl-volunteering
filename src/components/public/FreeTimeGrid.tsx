"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { cellKey, parseCellKey, slotsIn, weekdayLong, weekdayShort, WHOLE_WEEK } from "@/components/availability/grid";
import { usePaintGesture } from "@/components/availability/usePaintGesture";
import { formatMinute } from "@/lib/planTime";
import { FREE_RANGE, FREE_STEP, freeBlocks, freeCells, freeSummary, type FreeBlock } from "@/lib/volunteers";

/**
 * A typical week, Lettuce Meet style: drag across the half-hours you're free
 * and they fill in; start a drag on a filled one to clear. A finger taps to
 * toggle, or holds then drags. The arrows move and Space toggles.
 */
export function FreeTimeGrid({ value, onChange }: { value: FreeBlock[]; onChange: (next: FreeBlock[]) => void }) {
  const cells = useMemo(() => freeCells(value), [value]);
  const slots = useMemo(() => slotsIn(FREE_RANGE), []);
  const [focusKey, setFocusKey] = useState(() => cellKey(1, FREE_RANGE.start));

  function paint(keys: string[], mode: "paint" | "erase") {
    const next = new Set(cells);
    for (const key of keys) {
      if (mode === "paint") next.add(key);
      else next.delete(key);
    }
    onChange(freeBlocks(next));
  }

  const { grid, preview, handlers } = usePaintGesture({
    days: WHOLE_WEEK,
    modeAt: (key) => (cells.has(key) ? "erase" : "paint"),
    onPaint: paint,
    onCellDown: setFocusKey,
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { weekday, minute } = parseCellKey(focusKey);
    let d = weekday;
    let m = minute;
    switch (event.key) {
      case "ArrowUp": m -= FREE_STEP; break;
      case "ArrowDown": m += FREE_STEP; break;
      case "ArrowLeft": d -= 1; break;
      case "ArrowRight": d += 1; break;
      default: return;
    }
    event.preventDefault();
    if (d < 1 || d > 7 || m < FREE_RANGE.start || m >= FREE_RANGE.end) return;
    const key = cellKey(d, m);
    setFocusKey(key);
    grid.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
  }

  const shown = (key: string) => (preview?.keys.has(key) ? preview.mode === "paint" : cells.has(key));
  const summary = freeSummary(value);

  return (
    <div className="pub-free">
      <p className="muted small pub-free-help">
        <span className="pub-free-fine">Drag across the times you&apos;re usually free, drag again from a filled time to clear it</span>
        <span className="pub-free-coarse">Tap the times you&apos;re usually free, or hold then drag to fill several</span>
      </p>
      <div
        ref={grid}
        className={`pub-free-grid${preview ? " is-painting" : ""}`}
        style={{ "--free-days": WHOLE_WEEK.length } as CSSProperties}
        role="grid"
        aria-label="Times you're free in a typical week"
        data-no-swipe
        {...handlers}
        onKeyDown={onKeyDown}
      >
        <div role="row" className="pub-free-row pub-free-head">
          <span aria-hidden />
          {WHOLE_WEEK.map((d) => (
            <span key={d} role="columnheader" className="micro-label">
              {weekdayShort(d)}
            </span>
          ))}
        </div>
        {slots.map((minute) => (
          <div role="row" key={minute} className={`pub-free-row${minute % 60 === 0 ? " is-hour" : ""}`}>
            <span role="rowheader" className="pub-free-time">
              {minute % 60 === 0 ? formatMinute(minute) : <span className="sr-only">{formatMinute(minute)}</span>}
            </span>
            {WHOLE_WEEK.map((weekday) => {
              const key = cellKey(weekday, minute);
              const on = shown(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  tabIndex={key === focusKey ? 0 : -1}
                  aria-selected={on}
                  aria-label={`${weekdayLong(weekday)} ${formatMinute(minute)}: ${on ? "free" : "not free"}`}
                  className="pub-free-cell"
                  data-cell
                  data-key={key}
                  data-weekday={weekday}
                  data-minute={minute}
                  data-on={on || undefined}
                  data-preview={preview?.keys.has(key) ? preview.mode : undefined}
                  onFocus={() => setFocusKey(key)}
                  onClick={(event) => {
                    // Pointers paint through the gesture; this is the keyboard's Space and Enter.
                    if (event.detail === 0) paint([key], cells.has(key) ? "erase" : "paint");
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="pub-free-summary" aria-live="polite">
        {summary.length ? (
          <>
            <ul>
              {summary.map((line) => (
                <li key={line} className="mono small">
                  {line}
                </li>
              ))}
            </ul>
            <button type="button" className="button ghost small" onClick={() => onChange([])}>
              Clear
            </button>
          </>
        ) : (
          <p className="muted small">Nothing filled in yet</p>
        )}
      </div>
    </div>
  );
}
