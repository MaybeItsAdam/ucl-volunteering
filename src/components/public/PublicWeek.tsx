"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, MapPin } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { dayLabel, hourLabel, WEEKDAYS_SHORT, weekRange } from "@/components/plan/format";
import { layoutWeek, peakOverlap, PX_PER_MINUTE, WINDOW_END, WINDOW_START, type DaySegment } from "@/components/plan/layout";
import { societyLabel } from "@/components/whatson/view";
import type { CommunityEvent, CommunitySociety } from "@/lib/communityEvents";
import { formatMinute, londonDayKey, londonMinuteOfDay, mondayOf, shiftDayKey } from "@/lib/planTime";
import "./calendar.css";

type CalEvent = CommunityEvent;

const GRID_HEIGHT = (WINDOW_END - WINDOW_START) * PX_PER_MINUTE;
const HOURS = Array.from({ length: (WINDOW_END - WINDOW_START) / 60 }, (_, i) => WINDOW_START / 60 + i);
/** How much wider a day gets per extra card side by side, and the most that counts. */
const PER_LANE = 0.7;
const MAX_LANES = 4;
/** A day with nothing on is drawn this fraction of a quiet day's width. */
const EMPTY_WEIGHT = 0.35;

/** The society's own colours as the card's hue, light and dark. */
function societyStyle(society: CommunitySociety | undefined): CSSProperties {
  if (!society?.colour) return {};
  return { "--soc": society.colour, "--soc-dark": society.darkColour ?? society.colour } as CSSProperties;
}

const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Google Calendar's "add this one event" link. */
function googleEventUrl(event: CommunityEvent, host: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: event.allDay
      ? `${londonDayKey(new Date(event.startsAt)).replace(/-/g, "")}/${londonDayKey(new Date(event.endsAt)).replace(/-/g, "")}`
      : `${icsStamp(event.startsAt)}/${icsStamp(event.endsAt)}`,
    details: `Run by ${host}\n\n${event.url}`,
    ctz: "Europe/London",
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

function whenLabel(event: CommunityEvent): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const day = dayLabel(londonDayKey(start));
  if (event.allDay) return `${day}, all day`;
  const endDay = londonDayKey(end);
  const endLabel = endDay === londonDayKey(start) ? formatMinute(londonMinuteOfDay(end)) : `${dayLabel(endDay)} ${formatMinute(londonMinuteOfDay(end))}`;
  return `${day}, ${formatMinute(londonMinuteOfDay(start))}–${endLabel}`;
}

/**
 * The public calendar as a week, Google Calendar style: hours down the side,
 * a column a day, overlapping events side by side. A busy day is drawn wider
 * than a quiet one and an empty day shrinks to a strip, so the week spends its
 * width on what's on. On a phone the week scrolls sideways a day at a time.
 *
 * Read only: an event opens a sheet with its details and links out.
 */
export function PublicWeek({
  societies,
  events,
  initialWeek,
  now: serverNow,
}: {
  societies: CommunitySociety[];
  events: CommunityEvent[];
  /** Monday's day key. */
  initialWeek: string;
  /** The server's clock, so the first render matches it. */
  now: string;
}) {
  const [now, setNow] = useState(() => new Date(serverNow));
  const today = londonDayKey(now);
  const thisWeek = mondayOf(today);
  const [week, setWeek] = useState(initialWeek);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<CalEvent | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const bySociety = useMemo(() => new Map(societies.map((s) => [s.id, s])), [societies]);
  // Chips only for societies with something coming up.
  const active = useMemo(() => societies.filter((s) => events.some((e) => e.societyId === s.id)), [societies, events]);
  const lastWeek = useMemo(
    () => (events.length ? mondayOf(londonDayKey(new Date(events[events.length - 1].startsAt))) : thisWeek),
    [events, thisWeek],
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDayKey(week, i)), [week]);
  const shown = useMemo(() => events.filter((e) => !hidden.has(e.societyId)) as CalEvent[], [events, hidden]);
  const layout = useMemo(() => layoutWeek(shown, days), [shown, days]);
  const weekCount = days.reduce((n, d) => n + layout.counts[d], 0);

  // Each day's share of the width: wider for every card side by side, a strip when empty.
  const columns = days
    .map((day) => {
      if (!layout.counts[day]) return `minmax(var(--cal-empty), ${EMPTY_WEIGHT}fr)`;
      const lanes = Math.min(Math.max(peakOverlap(layout.days[day]), 1), MAX_LANES);
      return `minmax(var(--cal-min), ${1 + PER_LANE * (lanes - 1)}fr)`;
    })
    .join(" ");
  const busyDays = days.filter((d) => layout.counts[d]).length;
  // The grid's own width: every day at its minimum, or the scroller if wider.
  // Set outright so the columns never depend on what's written in them.
  const gridWidth = `max(100%, calc(var(--cal-gutter) + ${busyDays} * var(--cal-min) + ${7 - busyDays} * var(--cal-empty)))`;
  const allDayRows = layout.allDay.reduce((n, a) => Math.max(n, a.row + 1), 0);

  // Open a week at its first event (or 9:00), and on a phone at today or the first busy day.
  const firstMinute = useMemo(() => {
    const tops = days.flatMap((d) => layout.days[d].map((s) => s.top));
    return tops.length ? Math.min(...tops) : 9 * 60;
  }, [days, layout]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (firstMinute - WINDOW_START - 30) * PX_PER_MINUTE);
    const startIndex = days.findIndex((d) => d >= today && layout.counts[d] > 0);
    const col = el.querySelector<HTMLElement>(`[data-cal-day="${days[Math.max(startIndex, 0)]}"]`);
    const gutter = el.querySelector<HTMLElement>(".cal-corner")?.offsetWidth ?? 0;
    el.scrollLeft = startIndex > 0 && col ? col.offsetLeft - gutter : 0;
    // Only when the week changes; filtering shouldn't jump the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  function go(next: string) {
    setWeek(next);
    const url = new URL(window.location.href);
    if (next === thisWeek) url.searchParams.delete("week");
    else url.searchParams.set("week", next);
    window.history.replaceState(null, "", url);
  }

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const nowMinute = londonMinuteOfDay(now);
  const openSociety = open ? bySociety.get(open.societyId) : undefined;
  const openHost = openSociety ? societyLabel(openSociety.name, openSociety.id) : "A society";

  return (
    <div className="cal">
      <div className="cal-bar">
        <div className="cal-weeknav">
          <button type="button" className="icon-button" aria-label="Previous week" disabled={week <= thisWeek} onClick={() => go(shiftDayKey(week, -7))}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 className="cal-range" aria-live="polite">
            {weekRange(week)}
            <span className="cal-range-count muted">{weekCount === 1 ? "1 event" : `${weekCount} events`}</span>
          </h2>
          <button type="button" className="icon-button" aria-label="Next week" disabled={week >= lastWeek} onClick={() => go(shiftDayKey(week, 7))}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        {week !== thisWeek && (
          <button type="button" className="button small cal-today" onClick={() => go(thisWeek)}>
            This week
          </button>
        )}
      </div>

      {active.length > 1 && (
        <div className="cal-chips" role="group" aria-label="Show events from">
          {active.map((s) => (
            <button
              key={s.id}
              type="button"
              className="cal-chip"
              aria-pressed={!hidden.has(s.id)}
              style={societyStyle(s)}
              onClick={() => toggle(s.id)}
              title={s.name}
            >
              <span className="cal-swatch" aria-hidden="true" />
              {societyLabel(s.name, s.id)}
            </button>
          ))}
        </div>
      )}

      <div className="cal-scroller" ref={scroller}>
        <div
          className="cal-grid"
          style={{ "--cal-cols": columns, "--cal-grid-height": `${GRID_HEIGHT}px`, width: gridWidth } as CSSProperties}
        >
          <div className="cal-corner" aria-hidden="true" />
          {days.map((day, i) => (
            <div
              key={day}
              className="cal-dayhead"
              data-cal-day={day}
              style={{ gridColumn: i + 2 }}
              data-today={day === today ? "" : undefined}
              data-empty={layout.counts[day] ? undefined : ""}
              data-past={day < today ? "" : undefined}
            >
              <span className="micro-label">{WEEKDAYS_SHORT[i]}</span>
              <span className="cal-dayhead-date">{Number(day.slice(8, 10))}</span>
            </div>
          ))}

          {allDayRows > 0 && (
            <div className="cal-allday">
              <span className="micro-label cal-allday-label">All day</span>
              {layout.allDay.map((a) => (
                <button
                  key={a.event.id}
                  type="button"
                  className="cal-chipevent"
                  data-cancelled={a.event.cancelled ? "" : undefined}
                  style={{ ...societyStyle(bySociety.get(a.event.societyId)), gridColumn: `${a.firstDay + 2} / ${a.lastDay + 3}`, gridRow: a.row + 1 }}
                  onClick={() => setOpen(a.event)}
                >
                  {a.event.title}
                </button>
              ))}
            </div>
          )}

          <div className="cal-gutter" aria-hidden="true">
            {HOURS.map((h) => (
              <span key={h} className="cal-hour" style={{ top: (h * 60 - WINDOW_START) * PX_PER_MINUTE }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          <div className="cal-lines" aria-hidden="true">
            {HOURS.slice(1).map((h) => (
              <div key={h} className="cal-line" style={{ top: (h * 60 - WINDOW_START) * PX_PER_MINUTE }} />
            ))}
          </div>
          {days.map((day, i) => (
            <div
              key={day}
              className="cal-col"
              role="group"
              aria-label={dayLabel(day)}
              style={{ gridColumn: i + 2 }}
              data-today={day === today ? "" : undefined}
              data-empty={layout.counts[day] ? undefined : ""}
              data-past={day < today ? "" : undefined}
            >
              {layout.days[day].map((s) => (
                <EventCard key={s.event.id} segment={s} society={bySociety.get(s.event.societyId)} onOpen={() => setOpen(s.event)} />
              ))}
              {day === today && nowMinute >= WINDOW_START && nowMinute <= WINDOW_END && (
                <div className="cal-now" style={{ top: (nowMinute - WINDOW_START) * PX_PER_MINUTE }} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>

      {weekCount === 0 && (
        <p className="cal-empty muted small">
          Nothing on this week{hidden.size ? " from the societies you've picked" : ""}
          {week < lastWeek ? " — try the next one" : ""}
        </p>
      )}

      {open && (
        <Sheet onClose={() => setOpen(null)} labelledBy="cal-sheet-title">
          <div className="cal-sheet" style={societyStyle(openSociety)}>
            <span className="cal-sheet-host">
              <span className="cal-swatch" aria-hidden="true" />
              {openHost}
            </span>
            <h2 id="cal-sheet-title" className={open.cancelled ? "cal-cancelled" : undefined}>
              {open.title}
            </h2>
            {open.cancelled && <span className="tag bad">Cancelled</span>}
            <dl className="details">
              <dt>When</dt>
              <dd>{whenLabel(open)}</dd>
              {open.location && (
                <>
                  <dt>Where</dt>
                  <dd>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(open.location)}`} target="_blank" rel="noopener noreferrer">
                      <MapPin size={13} aria-hidden="true" /> {open.location}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <div className="cal-sheet-actions">
              <a className="button primary" href={open.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} aria-hidden="true" />
                Details and booking
              </a>
              <a className="button" href={googleEventUrl(open, openHost)} target="_blank" rel="noopener noreferrer">
                <CalendarPlus size={16} aria-hidden="true" />
                Add to Google Calendar
              </a>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function EventCard({
  segment,
  society,
  onOpen,
}: {
  segment: DaySegment<CalEvent>;
  society: CommunitySociety | undefined;
  onOpen: () => void;
}) {
  const { event } = segment;
  const height = (segment.bottom - segment.top) * PX_PER_MINUTE;
  const size = height < 34 ? "xs" : height < 58 ? "sm" : "md";
  const host = society ? societyLabel(society.name, society.id) : "";
  const time = `${formatMinute(segment.start)}–${formatMinute(segment.end)}`;
  return (
    <button
      type="button"
      className="cal-event"
      data-size={size}
      data-stacked={segment.stacked ? "" : undefined}
      data-cancelled={event.cancelled ? "" : undefined}
      style={{
        ...societyStyle(society),
        top: (segment.top - WINDOW_START) * PX_PER_MINUTE,
        height,
        left: `calc(${segment.left * 100}% + 2px)`,
        width: `calc(${segment.width * 100}% - 4px)`,
        zIndex: 2 + segment.z,
      }}
      aria-label={`${event.title}, ${time}${host ? `, ${host}` : ""}${event.cancelled ? ", cancelled" : ""}`}
      onClick={onOpen}
    >
      <span className="cal-event-title">{event.title}</span>
      <span className="cal-event-time">
        {segment.clippedStart && segment.start < WINDOW_START ? "↑ " : ""}
        {time}
      </span>
      {size === "md" && host && <span className="cal-event-host">{host}</span>}
    </button>
  );
}
