"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { MemberColour } from "@/lib/access";
import { formatMinute } from "@/lib/planTime";
import type { AvailabilityBlock } from "@/lib/types";
import {
  bestMeetingSlots,
  cellKey,
  daySpans,
  everyoneFreeCells,
  overlay,
  parseCellKey,
  slotsIn,
  weekdayLong,
  weekdayShort,
  SLOT_MINUTES,
  type Absence,
  type MeetingSlot,
  type MinuteRange,
} from "./grid";

export interface ShownMember {
  id: string;
  name: string;
  colour: MemberColour;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function slotSummary(slot: MeetingSlot, byId: Map<string, ShownMember>): string {
  const total = slot.free.length + slot.absent.length;
  if (!slot.absent.length) return total === 1 ? "free" : total === 2 ? "both free" : `all ${total} free`;
  return `${slot.free.length} of ${total} free · not ${joinNames(slot.absent.map((id) => firstName(byId.get(id)?.name ?? "?")))}`;
}

/**
 * "Committee": everyone's unavailability laid over the same week. Each cell is
 * shaded by how many are out and carries their dots; a run of an hour or more
 * with everyone free is tinted emerald, and the best of those are listed as
 * times to meet. Hover or tap a cell for who and why. On a phone the grid
 * gives way to a list per day.
 */
export function CommitteeView({
  members,
  blocks,
  days,
  range,
}: {
  members: ShownMember[];
  blocks: readonly AvailabilityBlock[];
  days: readonly number[];
  range: MinuteRange;
}) {
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const shown = useMemo(() => members.filter((m) => !hiddenIds.has(m.id)), [members, hiddenIds]);
  const shownIds = useMemo(() => shown.map((m) => m.id), [shown]);
  const slots = useMemo(() => slotsIn(range), [range]);
  const cells = useMemo(() => overlay(blocks, shownIds), [blocks, shownIds]);
  const free = useMemo(() => everyoneFreeCells(cells, days, range), [cells, days, range]);
  const best = useMemo(() => bestMeetingSlots(blocks, shownIds, days, range), [blocks, shownIds, days, range]);

  const inspected = hovered ?? pinned;
  const total = shown.length;

  function toggleMember(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="panel flush avail-committee" aria-labelledby="avail-committee-title">
      <header className="panel-head avail-panel-head">
        <h2 id="avail-committee-title" className="micro-label">Committee</h2>
        <div className="avail-filters" role="group" aria-label="Show members">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="avail-filter hit"
              aria-pressed={!hiddenIds.has(m.id)}
              onClick={() => toggleMember(m.id)}
            >
              <span className="swatch" data-colour={m.colour} aria-hidden />
              {m.name}
            </button>
          ))}
          {hiddenIds.size > 0 && (
            <button type="button" className="button ghost small" onClick={() => setHiddenIds(new Set())}>
              Show all
            </button>
          )}
        </div>
      </header>

      {total === 0 ? (
        <p className="empty">Pick someone above to see when they&rsquo;re out.</p>
      ) : (
        <div className="avail-committee-body">
          <div className="avail-committee-main">
            <div
              className="avail-grid avail-grid-view"
              style={{ "--avail-days": days.length } as CSSProperties}
              role="grid"
              aria-label="When the committee is unavailable"
              onPointerLeave={() => setHovered(null)}
            >
              <div role="row" className="avail-row avail-row-head">
                <span className="avail-corner" aria-hidden />
                {days.map((d) => (
                  <span key={d} role="columnheader" className="avail-dayhead micro-label">
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
                    const absent = cells.get(key) ?? [];
                    const names = absent.map((a) => byId.get(a.memberId)?.name ?? "?");
                    return (
                      <button
                        key={key}
                        type="button"
                        role="gridcell"
                        className="avail-cell avail-heat"
                        data-key={key}
                        aria-selected={pinned === key}
                        aria-label={`${weekdayLong(weekday)} ${formatMinute(minute)}: ${
                          absent.length ? `${absent.length} unavailable, ${joinNames(names)}` : "everyone free"
                        }`}
                        data-free={free.has(key) || undefined}
                        data-count={absent.length}
                        style={{ "--heat": absent.length / total } as CSSProperties}
                        onPointerEnter={(event) => {
                          if (event.pointerType === "mouse") setHovered(key);
                        }}
                        onFocus={() => setHovered(key)}
                        onBlur={() => setHovered(null)}
                        onClick={() => setPinned((p) => (p === key ? null : key))}
                      >
                        {absent.length > 0 && (
                          <>
                            <span className="avail-count mono">{absent.length}</span>
                            <span className="avail-dots" aria-hidden>
                              {absent.map((a) => (
                                <span key={a.memberId} className="swatch" data-colour={byId.get(a.memberId)?.colour} />
                              ))}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="small muted avail-legend">
              <span className="avail-legend-heat" aria-hidden /> Darker: more people out.{" "}
              <span className="avail-legend-free" aria-hidden /> Everyone free for an hour or more.
            </p>
          </div>

          <aside className="avail-side">
            <div className="avail-inspector" aria-live="polite">
              {inspected ? (
                <Inspector cellKeyValue={inspected} absent={cells.get(inspected) ?? []} shown={shown} byId={byId} />
              ) : (
                <p className="small muted">Hover or tap a time to see who&rsquo;s out and why.</p>
              )}
            </div>
            <BestTimes best={best} byId={byId} />
          </aside>

          <div className="avail-daylist">
            <BestTimes best={best} byId={byId} />
            {days.map((weekday) => (
              <DayList key={weekday} weekday={weekday} spans={daySpans(cells, weekday, range)} byId={byId} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Inspector({
  cellKeyValue,
  absent,
  shown,
  byId,
}: {
  cellKeyValue: string;
  absent: Absence[];
  shown: ShownMember[];
  byId: Map<string, ShownMember>;
}) {
  const { weekday, minute } = parseCellKey(cellKeyValue);
  const out = new Set(absent.map((a) => a.memberId));
  const freeMembers = shown.filter((m) => !out.has(m.id));
  return (
    <>
      <span className="micro-label">
        {weekdayLong(weekday)} <span className="mono">{formatMinute(minute)}–{formatMinute(minute + SLOT_MINUTES)}</span>
      </span>
      {absent.length ? (
        <ul className="avail-people">
          {absent.map((a) => {
            const m = byId.get(a.memberId);
            return (
              <li key={a.memberId}>
                <span className="swatch" data-colour={m?.colour} aria-hidden />
                <span>{m?.name ?? "?"}</span>
                {a.note && <span className="muted">· {a.note}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small avail-allfree">Everyone free.</p>
      )}
      {absent.length > 0 && freeMembers.length > 0 && (
        <p className="small muted">Free: {joinNames(freeMembers.map((m) => m.name))}</p>
      )}
    </>
  );
}

function BestTimes({ best, byId }: { best: MeetingSlot[]; byId: Map<string, ShownMember> }) {
  return (
    <div className="avail-best">
      <span className="micro-label">Best times for a committee meeting</span>
      {best.length ? (
        <ol className="avail-best-list">
          {best.map((slot) => (
            <li key={`${slot.weekday}:${slot.startMinute}`} data-all-free={!slot.absent.length || undefined}>
              <span className="mono avail-best-time">
                {weekdayShort(slot.weekday)} {formatMinute(slot.startMinute)}–{formatMinute(slot.endMinute)}
              </span>
              <span className="avail-best-who">{slotSummary(slot, byId)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="small muted">No hour in the week has anyone free. Try fewer people, or the wider hours.</p>
      )}
    </div>
  );
}

function DayList({
  weekday,
  spans,
  byId,
}: {
  weekday: number;
  spans: ReturnType<typeof daySpans>;
  byId: Map<string, ShownMember>;
}) {
  return (
    <div className="avail-day">
      <span className="micro-label">{weekdayLong(weekday)}</span>
      <ul className="avail-spans">
        {spans.map((span) => {
          const long = span.endMinute - span.startMinute >= 60;
          return (
            <li key={span.startMinute} data-free={(!span.absent.length && long) || undefined}>
              <span className="mono avail-span-time">
                {formatMinute(span.startMinute)}–{formatMinute(span.endMinute)}
              </span>
              {span.absent.length ? (
                <span className="avail-span-who">
                  {span.absent.map((a) => {
                    const m = byId.get(a.memberId);
                    return (
                      <span key={a.memberId} className="avail-span-person">
                        <span className="swatch" data-colour={m?.colour} aria-hidden />
                        {m ? firstName(m.name) : "?"}
                        {a.note && <span className="muted"> ({a.note})</span>}
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span className={long ? "avail-span-free" : "muted"}>Everyone free</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
