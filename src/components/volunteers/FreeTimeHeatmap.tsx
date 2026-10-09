"use client";

import { useMemo, type CSSProperties } from "react";
import { cellKey, slotsIn, weekdayLong, weekdayShort, WHOLE_WEEK } from "@/components/availability/grid";
import { formatMinute } from "@/lib/planTime";
import { FREE_RANGE, freeCells, type Volunteer } from "@/lib/volunteers";

export interface FreeAt {
  weekday: number;
  minute: number;
}

/**
 * Everyone's free times laid over one week, Lettuce Meet's results view: the
 * more people free in a half-hour, the deeper its colour. Picking a
 * half-hour filters the register to who's free then.
 */
export function FreeTimeHeatmap({
  volunteers,
  selected,
  onSelect,
}: {
  volunteers: Volunteer[];
  selected: FreeAt | null;
  onSelect: (at: FreeAt | null) => void;
}) {
  const slots = useMemo(() => slotsIn(FREE_RANGE), []);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of volunteers) for (const key of freeCells(v.free_times)) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, [volunteers]);
  const max = Math.max(0, ...counts.values());

  return (
    <div className="vol-heat">
      <div className="vol-heat-head">
        <span className="micro-label">Who&apos;s free when</span>
        <span className="muted small">
          {max ? `Darkest is ${max} ${max === 1 ? "person" : "people"}, pick a time to see who` : "Nobody here has filled in their week yet"}
        </span>
      </div>
      <div className="vol-heat-grid" role="grid" aria-label="How many volunteers are free in each half-hour">
        <div role="row" className="vol-heat-row">
          <span aria-hidden />
          {WHOLE_WEEK.map((d) => (
            <span key={d} role="columnheader" className="micro-label">
              {weekdayShort(d)}
            </span>
          ))}
        </div>
        {slots.map((minute) => (
          <div role="row" key={minute} className={`vol-heat-row${minute % 60 === 0 ? " is-hour" : ""}`}>
            <span role="rowheader" className="vol-heat-time">
              {minute % 60 === 0 ? formatMinute(minute) : <span className="sr-only">{formatMinute(minute)}</span>}
            </span>
            {WHOLE_WEEK.map((weekday) => {
              const n = counts.get(cellKey(weekday, minute)) ?? 0;
              const on = selected?.weekday === weekday && selected.minute === minute;
              return (
                <button
                  key={weekday}
                  type="button"
                  role="gridcell"
                  className="vol-heat-cell"
                  style={{ "--heat": max ? n / max : 0 } as CSSProperties}
                  aria-selected={on}
                  aria-label={`${weekdayLong(weekday)} ${formatMinute(minute)}: ${n} free`}
                  title={`${weekdayShort(weekday)} ${formatMinute(minute)} · ${n} free`}
                  onClick={() => onSelect(on ? null : { weekday, minute })}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
