"use client";

import { CalendarOff, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  formatMinute,
  isoWeekday,
  londonDateAt,
  londonDayKey,
  londonMinuteOfDay,
  shortDate,
} from "@/lib/planTime";
import {
  CATEGORY_LABELS,
  RESPONSE_LABELS,
  STATUS_LABELS,
  type AvailabilityBlock,
  type CommitteeMember,
  type PlanEvent,
} from "@/lib/types";
import type { TimetableStatus } from "@/lib/timetable";
import { AvailabilitySheet } from "@/components/availability/AvailabilitySheet";
import { patchEvent } from "./api";
import { CreateEventSheet, type CreateDraft } from "./CreateEventSheet";
import { dayLabel, hourLabel, myResponse, SOURCE_LABELS, timeRange, WEEKDAYS_SHORT } from "./format";
import {
  clampToWindow,
  dragStartMinute,
  layoutWeek,
  PX_PER_MINUTE,
  resizeEndMinute,
  selectionRange,
  WINDOW_END,
  WINDOW_START,
  type DaySegment,
} from "./layout";
import "./plan.css";

/** Mouse: moving this far turns a press into a drag. */
const MOUSE_SLOP = 4;
/** Touch: hold this long (without moving) to pick an event up, so a swipe still scrolls. */
const LONG_PRESS_MS = 280;
const TOUCH_SLOP = 8;

const HOURS = Array.from({ length: (WINDOW_END - WINDOW_START) / 60 }, (_, i) => WINDOW_START / 60 + i);
const GRID_HEIGHT = (WINDOW_END - WINDOW_START) * PX_PER_MINUTE;

type Mode = "move" | "resize" | "create";

interface Gesture {
  mode: Mode;
  pointerId: number;
  touch: boolean;
  x: number;
  y: number;
  dayIndex: number;
  active: boolean;
  timer: number | null;
  /** move / resize */
  event?: PlanEvent;
  origStart: number;
  origEnd: number;
  /** create: the minute pressed. move: minutes from the event's start to the pointer. */
  grabOffset: number;
  preview: Preview | null;
  cleanup: () => void;
}

interface Preview {
  mode: Mode;
  eventId: string | null;
  dayIndex: number;
  start: number;
  end: number;
}

// The clock, ticking once a minute. On the server and during hydration it is
// the server's time, so the first client render matches the HTML.
function subscribeMinute(callback: () => void) {
  const id = window.setInterval(callback, 20_000);
  return () => window.clearInterval(id);
}
const clientMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

/** A single-day segment of a VolSoc event that isn't all-day: the only kind that drags. */
function isDraggable(segment: DaySegment, canEdit: boolean) {
  return canEdit && segment.event.source === "volsoc" && !segment.continuesFrom && !segment.continuesTo;
}

export interface WeekPlannerProps {
  days: string[];
  events: PlanEvent[];
  serverNow: number;
  myId: string;
  canEdit: boolean;
  me: CommitteeMember;
  members: CommitteeMember[];
  /** Everyone's weekly unavailability. */
  blocks: AvailabilityBlock[];
  /** This week's lectures from linked UCL timetables. */
  timetableBlocks: AvailabilityBlock[];
  timetableStatus: TimetableStatus | null;
  canSaveAvailability: boolean;
  /** Open with your availability up to edit (/portal/availability lands here). */
  editAvailability: boolean;
  prevWeek: string;
  nextWeek: string;
  /** Mobile: the day to open on (0 Monday … 6 Sunday). */
  initialDay: number;
}

export function WeekPlanner({
  days,
  events,
  serverNow,
  myId,
  canEdit,
  me,
  members,
  blocks,
  timetableBlocks,
  timetableStatus,
  canSaveAvailability,
  editAvailability,
  prevWeek,
  nextWeek,
  initialDay,
}: WeekPlannerProps) {
  const router = useRouter();
  const now = useSyncExternalStore(subscribeMinute, clientMinute, () => Math.floor(serverNow / 60_000) * 60_000);
  const nowDate = new Date(now);
  const today = londonDayKey(nowDate);
  const nowMinute = londonMinuteOfDay(nowDate);

  // Optimistic times while a PATCH is out; dropped when the server's next render arrives.
  const [overrides, setOverrides] = useState<Record<string, { startsAt: string; endsAt: string }>>({});
  const [seenEvents, setSeenEvents] = useState(events);
  if (seenEvents !== events) {
    setSeenEvents(events);
    setOverrides({});
  }
  const shown = useMemo(
    () => events.map((e) => (overrides[e.id] ? { ...e, ...overrides[e.id] } : e)),
    [events, overrides],
  );
  const layout = useMemo(() => layoutWeek(shown, days), [shown, days]);

  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [draft, setDraft] = useState<CreateDraft | null>(null);
  const [mobileDay, setMobileDay] = useState(initialDay);
  const [overlay, setOverlay] = useState<string[]>([]);
  const [availabilityOpen, setAvailabilityOpen] = useState(editAvailability);

  const bodyRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gesture = useRef<Gesture | null>(null);
  /** A drag ends in a click on the card; this swallows it rather than opening the event. */
  const suppressClickUntil = useRef(0);

  // Once a touch drag has begun, stop the page scrolling under the finger.
  // React's touch handlers are passive, so this has to be added by hand.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current?.active) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // ── Geometry ──

  const minuteAt = useCallback((clientY: number) => {
    const rect = bodyRef.current!.getBoundingClientRect();
    return WINDOW_START + (clientY - rect.top) / PX_PER_MINUTE;
  }, []);

  /** The visible day column under (or nearest to) x; on a phone only one is visible. */
  const dayAt = useCallback((clientX: number, fallback: number) => {
    let best = fallback;
    let bestDistance = Infinity;
    colRefs.current.forEach((col, i) => {
      if (!col) return;
      const r = col.getBoundingClientRect();
      if (!r.width) return;
      const d = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  }, []);

  // ── Commit ──

  async function commit(event: PlanEvent, day: string, start: number, end: number) {
    const startsAt = londonDateAt(day, start).toISOString();
    const endsAt = londonDateAt(day, end).toISOString();
    if (startsAt === event.startsAt && endsAt === event.endsAt) return;
    setError(null);
    setOverrides((o) => ({ ...o, [event.id]: { startsAt, endsAt } }));
    try {
      await patchEvent(event.id, { startsAt, endsAt });
      router.refresh();
    } catch (e) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[event.id];
        return next;
      });
      setError(`Couldn't move “${event.title}”: ${e instanceof Error ? e.message : "something went wrong"}`);
    }
  }

  // ── Gestures ──
  //
  // A press on a VolSoc card (move), its bottom edge (resize) or empty grid
  // (create) starts a gesture. The window listeners are made per gesture and
  // kept on it, so the ones removed are always the ones added, whatever has
  // re-rendered in between.

  function track(g: Gesture, clientX: number, clientY: number) {
    const minute = minuteAt(clientY);
    let next: Preview;
    if (g.mode === "move") {
      const duration = g.origEnd - g.origStart;
      const start = dragStartMinute(minute - g.grabOffset, duration);
      next = { mode: "move", eventId: g.event!.id, dayIndex: dayAt(clientX, g.dayIndex), start, end: start + duration };
    } else if (g.mode === "resize") {
      next = { mode: "resize", eventId: g.event!.id, dayIndex: g.dayIndex, start: g.origStart, end: resizeEndMinute(minute, g.origStart) };
    } else {
      next = { mode: "create", eventId: null, dayIndex: g.dayIndex, ...selectionRange(g.grabOffset, minute) };
    }
    g.preview = next;
    setPreview(next);
  }

  function activate(g: Gesture, clientX: number, clientY: number) {
    g.active = true;
    if (g.touch) navigator.vibrate?.(8);
    track(g, clientX, clientY);
  }

  function finish(g: Gesture) {
    if (g.timer) window.clearTimeout(g.timer);
    g.cleanup();
    if (gesture.current === g) gesture.current = null;
  }

  function begin(e: ReactPointerEvent, init: Pick<Gesture, "mode" | "dayIndex" | "event" | "origStart" | "origEnd" | "grabOffset">) {
    if (e.button !== 0 || gesture.current) return;
    const touch = e.pointerType !== "mouse";
    if (!touch) e.preventDefault(); // no text selection while dragging

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== g.pointerId) return;
      if (!g.active) {
        const moved = Math.hypot(ev.clientX - g.x, ev.clientY - g.y);
        if (g.touch) {
          // Moving before the hold completes is a scroll: let it go.
          if (moved > TOUCH_SLOP) finish(g);
          return;
        }
        if (moved >= MOUSE_SLOP) activate(g, ev.clientX, ev.clientY);
        return;
      }
      ev.preventDefault();
      track(g, ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== g.pointerId) return;
      finish(g);
      if (!g.active) {
        // A plain click on empty grid with a mouse makes an hour there. A tap
        // does nothing, so a phone scrolls freely; it has the New event button.
        if (g.mode === "create" && !g.touch) setDraft({ day: days[g.dayIndex], ...selectionRange(g.grabOffset, g.grabOffset) });
        return;
      }
      suppressClickUntil.current = performance.now() + 400;
      const p = g.preview;
      setPreview(null);
      if (!p) return;
      if (p.mode === "create") setDraft({ day: days[p.dayIndex], start: p.start, end: p.end });
      else if (g.event && (p.dayIndex !== g.dayIndex || p.start !== g.origStart || p.end !== g.origEnd)) {
        void commit(g.event, days[p.dayIndex], p.start, p.end);
      }
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== g.pointerId) return;
      finish(g);
      setPreview(null);
    };

    const g: Gesture = {
      ...init,
      pointerId: e.pointerId,
      touch,
      x: e.clientX,
      y: e.clientY,
      active: false,
      timer: null,
      preview: null,
      cleanup: () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      },
    };
    gesture.current = g;
    // The resize handle is touch-action: none, so it can't scroll: pick it up at once.
    if (touch && init.mode === "resize") activate(g, e.clientX, e.clientY);
    else if (touch) {
      const { clientX, clientY } = e;
      g.timer = window.setTimeout(() => {
        if (gesture.current === g) activate(g, clientX, clientY);
      }, LONG_PRESS_MS);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function onEventPointerDown(e: ReactPointerEvent, segment: DaySegment, dayIndex: number, mode: "move" | "resize") {
    // Never let a press on a card reach the column, where it would start a new event.
    e.stopPropagation();
    if (!isDraggable(segment, canEdit)) return;
    begin(e, {
      mode,
      dayIndex,
      event: segment.event,
      origStart: segment.start,
      origEnd: segment.end,
      grabOffset: minuteAt(e.clientY) - segment.start,
    });
  }

  function onColumnPointerDown(e: ReactPointerEvent, dayIndex: number) {
    if (!canEdit) return;
    begin(e, { mode: "create", dayIndex, origStart: 0, origEnd: 0, grabOffset: minuteAt(e.clientY) });
  }

  // Leaving mid-drag must not leave listeners behind.
  useEffect(() => {
    const ref = gesture;
    return () => {
      const g = ref.current;
      if (g) {
        if (g.timer) window.clearTimeout(g.timer);
        g.cleanup();
      }
    };
  }, []);

  // ── Render helpers ──

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const overlayBlocks = useMemo(
    () => [...blocks, ...timetableBlocks].filter((b) => overlay.includes(b.memberId)),
    [blocks, timetableBlocks, overlay],
  );

  function closeAvailability() {
    setAvailabilityOpen(false);
    // Drop ?availability=edit, so a reload doesn't open it again.
    const url = new URL(window.location.href);
    if (url.searchParams.has("availability")) {
      url.searchParams.delete("availability");
      window.history.replaceState(null, "", url);
    }
  }

  function newEvent() {
    const dayIndex = days.includes(today) ? days.indexOf(today) : mobileDay;
    const start = Math.min(Math.max(Math.ceil((nowMinute + 1) / 60) * 60, 10 * 60), 20 * 60);
    setDraft({ day: days[dayIndex], start, end: start + 60 });
  }

  const allDayForMobile = layout.allDay.filter((a) => a.firstDay <= mobileDay && a.lastDay >= mobileDay);
  const allDayRows = layout.allDay.reduce((n, a) => Math.max(n, a.row + 1), 0);

  return (
    <div className="plan-planner" data-dragging={preview ? "" : undefined}>
      <div className="plan-controls">
        {/* Availability: whose unavailable times to lay over the week, and your own to edit */}
        <div className="plan-overlay-legend" role="group" aria-label="Availability">
          <span className="micro-label">Availability</span>
          <div className="plan-overlay-members" role="group" aria-label="Show when committee members are unavailable">
            {members.map((m) => {
              const on = overlay.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="plan-member-toggle hit"
                  data-colour={m.colour ?? undefined}
                  aria-pressed={on}
                  title={`Show when ${m.name} is unavailable`}
                  onClick={() => setOverlay((o) => (on ? o.filter((id) => id !== m.id) : [...o, m.id]))}
                >
                  <span className="swatch" data-colour={m.colour ?? undefined} aria-hidden="true" />
                  {m.name}
                </button>
              );
            })}
            {overlay.length > 0 && (
              <button type="button" className="button ghost small" onClick={() => setOverlay([])}>
                Clear
              </button>
            )}
          </div>
          <button type="button" className="button small plan-availability-edit" onClick={() => setAvailabilityOpen(true)}>
            <CalendarOff size={14} aria-hidden="true" />
            Edit my availability
          </button>
        </div>

        <div className="plan-toolbar">
          <div className="plan-daytabs" role="tablist" aria-label="Day">
            {days.map((day, i) => (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={i === mobileDay}
                className="plan-daytab"
                data-today={day === today ? "" : undefined}
                onClick={() => setMobileDay(i)}
              >
                <span className="plan-daytab-name">{WEEKDAYS_SHORT[i][0]}</span>
                <span className="plan-daytab-date">{Number(day.slice(8))}</span>
              </button>
            ))}
          </div>
          <div className="plan-daystep">
            {mobileDay > 0 ? (
              <button type="button" className="icon-button" aria-label="Previous day" onClick={() => setMobileDay(mobileDay - 1)}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
            ) : (
              <Link className="icon-button" aria-label="Previous week" href={`/portal/calendar?week=${prevWeek}&day=6`}>
                <ChevronLeft size={18} aria-hidden="true" />
              </Link>
            )}
            <span className="plan-daystep-label">{dayLabel(days[mobileDay])}</span>
            {mobileDay < 6 ? (
              <button type="button" className="icon-button" aria-label="Next day" onClick={() => setMobileDay(mobileDay + 1)}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ) : (
              <Link className="icon-button" aria-label="Next week" href={`/portal/calendar?week=${nextWeek}&day=0`}>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            )}
          </div>
          {canEdit && (
            <button type="button" className="button small primary plan-new" onClick={newEvent}>
              <Plus size={14} aria-hidden="true" />
              New event
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="notice bad plan-error" role="alert">
          <strong>Not saved</strong>
          <p>{error}</p>
          <button type="button" className="button ghost small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="plan-grid" data-mobile-day={mobileDay} style={{ "--plan-grid-height": `${GRID_HEIGHT}px` } as CSSProperties}>
        {/* Day headers */}
        <div className="plan-head">
          <div className="plan-gutter-head" aria-hidden="true" />
          {days.map((day, i) => (
            <div
              key={day}
              className="plan-dayhead"
              data-index={i}
              data-active={i === mobileDay ? "" : undefined}
              data-today={day === today ? "" : undefined}
            >
              <span className="micro-label">{WEEKDAYS_SHORT[i]}</span>
              <span className="plan-dayhead-date">{shortDate(day)}</span>
              <span className="plan-dayhead-count" aria-label={`${layout.counts[day]} events`}>
                {layout.counts[day] || ""}
              </span>
            </div>
          ))}
        </div>

        {/* All-day strip */}
        {layout.allDay.length > 0 && (
          <>
            <div className="plan-allday plan-allday--wide" style={{ "--rows": allDayRows } as CSSProperties}>
              <span className="micro-label plan-allday-label">All day</span>
              {layout.allDay.map((a) => (
                <EventChip
                  key={a.event.id}
                  event={a.event}
                  myId={myId}
                  style={{ gridColumn: `${a.firstDay + 2} / ${a.lastDay + 3}`, gridRow: a.row + 1 }}
                />
              ))}
            </div>
            {allDayForMobile.length > 0 && (
              <div className="plan-allday plan-allday--narrow">
                <span className="micro-label plan-allday-label">All day</span>
                {allDayForMobile.map((a) => (
                  <EventChip key={a.event.id} event={a.event} myId={myId} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Time grid */}
        <div className="plan-body">
          <div className="plan-gutter" aria-hidden="true">
            {HOURS.map((h) => (
              <div key={h} className="plan-hour-label" style={{ top: (h * 60 - WINDOW_START) * PX_PER_MINUTE }}>
                <span className="plan-hour-12">{hourLabel(h)}</span>
                <span className="plan-hour-24">{formatMinute(h * 60)}</span>
              </div>
            ))}
          </div>
          <div className="plan-columns" ref={bodyRef}>
            {days.map((day, i) => {
              const weekday = isoWeekday(day);
              const segments = layout.days[day];
              const isToday = day === today;
              return (
                <div
                  key={day}
                  ref={(el) => {
                    colRefs.current[i] = el;
                  }}
                  className="plan-col"
                  data-index={i}
                  data-active={i === mobileDay ? "" : undefined}
                  data-today={isToday ? "" : undefined}
                  data-editable={canEdit ? "" : undefined}
                  onPointerDown={(e) => onColumnPointerDown(e, i)}
                  // A long press is ours while a gesture is live: no context menu.
                  onContextMenu={(e) => {
                    if (gesture.current) e.preventDefault();
                  }}
                  aria-label={dayLabel(day)}
                  role="group"
                >
                  {overlayBlocks
                    .filter((b) => b.weekday === weekday && b.endMinute > WINDOW_START && b.startMinute < WINDOW_END)
                    .map((b) => {
                      const top = Math.max(b.startMinute, WINDOW_START);
                      const bottom = Math.min(b.endMinute, WINDOW_END);
                      const member = memberById.get(b.memberId);
                      return (
                        <div
                          key={b.id}
                          className="plan-unavailable"
                          data-colour={member?.colour ?? undefined}
                          style={{ top: (top - WINDOW_START) * PX_PER_MINUTE, height: (bottom - top) * PX_PER_MINUTE }}
                          title={`${member?.name ?? "Someone"} unavailable ${formatMinute(b.startMinute)}–${formatMinute(b.endMinute)}${b.note ? ` · ${b.note}` : ""}`}
                        >
                          <span className="plan-unavailable-name">{member?.name.split(" ")[0]}</span>
                        </div>
                      );
                    })}

                  {segments.map((s) => (
                    <EventCard
                      key={s.event.id}
                      segment={s}
                      myId={myId}
                      draggable={isDraggable(s, canEdit)}
                      dragging={preview?.eventId === s.event.id}
                      onPointerDown={(e, mode) => onEventPointerDown(e, s, i, mode)}
                      onClick={(e) => {
                        if (performance.now() < suppressClickUntil.current) e.preventDefault();
                      }}
                    />
                  ))}

                  {preview && preview.dayIndex === i && (
                    <Ghost preview={preview} title={shown.find((e) => e.id === preview.eventId)?.title ?? null} />
                  )}

                  {isToday && nowMinute >= WINDOW_START && nowMinute <= WINDOW_END && (
                    <div className="plan-now" style={{ top: (nowMinute - WINDOW_START) * PX_PER_MINUTE }} aria-hidden="true" />
                  )}
                </div>
              );
            })}
            {/* Solid hour lines, dashed half-hours; over the columns' tint, under the events. */}
            <div className="plan-lines" aria-hidden="true">
              {HOURS.map((h) => (
                <Fragment key={h}>
                  {h * 60 > WINDOW_START && <div className="plan-line" style={{ top: (h * 60 - WINDOW_START) * PX_PER_MINUTE }} />}
                  <div className="plan-line plan-line--half" style={{ top: (h * 60 + 30 - WINDOW_START) * PX_PER_MINUTE }} />
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {draft && <CreateEventSheet key={`${draft.day}-${draft.start}`} draft={draft} onClose={() => setDraft(null)} />}
      {availabilityOpen && (
        <AvailabilitySheet
          me={me}
          members={members}
          blocks={blocks}
          timetableBlocks={timetableBlocks}
          timetableStatus={timetableStatus}
          canSave={canSaveAvailability}
          onClose={closeAvailability}
        />
      )}
    </div>
  );
}

// ── Pieces ──

function Ghost({ preview, title }: { preview: Preview; title: string | null }) {
  const { top, bottom } = clampToWindow(preview.start, preview.end);
  return (
    <div
      className="plan-ghost"
      data-mode={preview.mode}
      style={{ top: (top - WINDOW_START) * PX_PER_MINUTE, height: (bottom - top) * PX_PER_MINUTE }}
      aria-live="polite"
    >
      <span className="plan-ghost-time">
        {formatMinute(preview.start)}–{formatMinute(preview.end)}
      </span>
      {title && <span className="plan-ghost-title">{title}</span>}
    </div>
  );
}

function ResponseDot({ event, myId }: { event: PlanEvent; myId: string }) {
  const mine = myResponse(event, myId);
  return (
    <span
      className="plan-dot"
      data-response={mine ?? "none"}
      title={mine ? `You: ${RESPONSE_LABELS[mine]}` : "You haven't answered"}
      aria-label={mine ? `You: ${RESPONSE_LABELS[mine]}` : "You haven't answered"}
    />
  );
}

function eventLabel(event: PlanEvent) {
  const day = londonDayKey(new Date(event.startsAt));
  return [
    event.title,
    `${dayLabel(day)}, ${timeRange(event)}`,
    CATEGORY_LABELS[event.category],
    STATUS_LABELS[event.status],
    SOURCE_LABELS[event.source],
    event.location,
  ]
    .filter(Boolean)
    .join(" · ");
}

function EventCard({
  segment,
  myId,
  draggable,
  dragging,
  onPointerDown,
  onClick,
}: {
  segment: DaySegment;
  myId: string;
  draggable: boolean;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent, mode: "move" | "resize") => void;
  onClick: (e: ReactMouseEvent) => void;
}) {
  const { event } = segment;
  const height = (segment.bottom - segment.top) * PX_PER_MINUTE;
  const size = height < 36 ? "xs" : height < 64 ? "sm" : "md";
  const style: CSSProperties = {
    top: (segment.top - WINDOW_START) * PX_PER_MINUTE,
    height,
    left: `calc(${segment.left * 100}% + 2px)`,
    width: `calc(${segment.width * 100}% - 4px)`,
    zIndex: 2 + segment.z,
  };
  return (
    <Link
      href={`/portal/calendar/events/${event.id}`}
      className="plan-event category-block"
      data-category={event.category}
      data-status={event.status}
      data-source={event.source}
      data-size={size}
      data-draggable={draggable ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      data-clip-start={segment.clippedStart ? "" : undefined}
      data-clip-end={segment.clippedEnd ? "" : undefined}
      data-stacked={segment.stacked ? "" : undefined}
      style={style}
      draggable={false}
      aria-label={eventLabel(event)}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onClick={onClick}
    >
      {segment.clippedStart && (
        <span className="plan-clip plan-clip--start" aria-hidden="true">
          ↑ {segment.continuesFrom ? "from yesterday" : formatMinute(segment.start)}
        </span>
      )}
      {size === "md" && (
        <span className="plan-event-top">
          <span className="plan-event-cat">{CATEGORY_LABELS[event.category]}</span>
          <ResponseDot event={event} myId={myId} />
        </span>
      )}
      <span className="plan-event-title">{event.title}</span>
      <span className="plan-event-time">
        {formatMinute(segment.start)}–{formatMinute(segment.end)}
        {size !== "md" && <ResponseDot event={event} myId={myId} />}
      </span>
      {size === "md" && event.location && <span className="plan-event-loc">{event.location}</span>}
      {size === "md" && height >= 96 && (
        <span className="plan-event-source" data-source={event.source}>
          {SOURCE_LABELS[event.source]}
        </span>
      )}
      {segment.clippedEnd && (
        <span className="plan-clip plan-clip--end" aria-hidden="true">
          ↓ {segment.continuesTo ? "past midnight" : formatMinute(segment.end)}
        </span>
      )}
      {draggable && (
        <span
          className="plan-resize"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.preventDefault();
            onPointerDown(e, "resize");
          }}
          onClick={(e) => e.preventDefault()}
        />
      )}
    </Link>
  );
}

function EventChip({ event, myId, style }: { event: PlanEvent; myId: string; style?: CSSProperties }) {
  return (
    <Link
      href={`/portal/calendar/events/${event.id}`}
      className="plan-chip category-block"
      data-category={event.category}
      data-status={event.status}
      style={style}
      aria-label={eventLabel(event)}
    >
      <span className="plan-event-title">{event.title}</span>
      <ResponseDot event={event} myId={myId} />
    </Link>
  );
}
