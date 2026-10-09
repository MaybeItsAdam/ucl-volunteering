"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  ListFilter,
  MapPin,
  Search,
  Ticket,
  X,
} from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { CalendarLinks } from "@/components/plan/CalendarLinks";
import { dayLabel, googleAddUrl, hourLabel, timeRange, WEEKDAYS_SHORT, weekRange } from "@/components/plan/format";
import { eventDaySpan, layoutWeek, peakOverlap, PX_PER_MINUTE, WINDOW_END, WINDOW_START, type DaySegment } from "@/components/plan/layout";
import { groupByDay, societyLabel } from "@/components/whatson/view";
import type { CommunityEvent, CommunitySociety } from "@/lib/communityEvents";
import { formatMinute, londonDayKey, londonMinuteOfDay, mondayOf, shiftDayKey } from "@/lib/planTime";
import { matchesQuery } from "./calendarSearch";
import "./calendar.css";

export type CalendarView = "week" | "list";

const GRID_HEIGHT = (WINDOW_END - WINDOW_START) * PX_PER_MINUTE;
const HOURS = Array.from({ length: (WINDOW_END - WINDOW_START) / 60 }, (_, i) => WINDOW_START / 60 + i);
/** How much wider a day gets per extra card side by side, and the most that counts. */
const PER_LANE = 0.7;
const MAX_LANES = 4;
/** A day with nothing on is drawn this fraction of a quiet day's width. */
const EMPTY_WEIGHT = 0.35;
/** Where the societies someone has hidden are remembered, on their device. */
const HIDDEN_KEY = "volsoc.calendar.hidden";

/** The society's own colours as the card's hue, light and dark. */
function societyStyle(society: CommunitySociety | undefined): CSSProperties {
  if (!society?.colour) return {};
  return { "--soc": society.colour, "--soc-dark": society.darkColour ?? society.colour } as CSSProperties;
}

const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Google Calendar's "add this one event" link. */
function googleEventUrl(event: CommunityEvent, host: string): string {
  const span = eventDaySpan(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: event.allDay
      ? `${span.first.replace(/-/g, "")}/${shiftDayKey(span.last, 1).replace(/-/g, "")}`
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

/** Whether a link only leads back here, so isn't worth a button. */
const isOwnLink = (url: string) => /\/calendar\?event=/.test(url);

/**
 * The public calendar. A week, Google Calendar style: hours down the side, a
 * column a day, overlapping events side by side, a busy day drawn wider than
 * a quiet one and an empty day shrunk to a strip. Or a list of everything
 * coming up, a day at a time.
 *
 * One bar on top holds it all: the week, a search, which societies to show
 * (remembered on the device), the view and the subscribe link. The arrow
 * keys move a week, T comes back to this one and / searches. The week, the
 * view, the search and an open event live in the URL, so any of them can be
 * shared.
 *
 * Read only: an event opens a sheet with its details and links out.
 */
export function PublicCalendar({
  societies,
  events,
  initialWeek,
  initialView,
  initialQuery,
  initialEvent,
  feedUrl,
  toolboxCalendarUrl,
  now: serverNow,
}: {
  societies: CommunitySociety[];
  events: CommunityEvent[];
  /** Monday's day key. */
  initialWeek: string;
  initialView: CalendarView;
  initialQuery: string;
  /** An event to open on arrival, from `?event=`. */
  initialEvent: string | null;
  /** The whole calendar's iCal feed. */
  feedUrl: string;
  /** Every society's events, on the Campus Toolbox. */
  toolboxCalendarUrl: string;
  /** The server's clock, so the first render matches it. */
  now: string;
}) {
  const [now, setNow] = useState(() => new Date(serverNow));
  const today = londonDayKey(now);
  const thisWeek = mondayOf(today);
  const linked = useMemo(() => (initialEvent ? events.find((e) => e.id === initialEvent) ?? null : null), [events, initialEvent]);
  const [week, setWeek] = useState(() => {
    if (!linked) return initialWeek;
    const monday = mondayOf(londonDayKey(new Date(linked.startsAt)));
    return monday < thisWeek ? thisWeek : monday;
  });
  const [view, setView] = useState<CalendarView>(initialView);
  const [query, setQuery] = useState(initialQuery);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<CommunityEvent | null>(linked);
  const [filtering, setFiltering] = useState(false);
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // The societies hidden last time, once the page is in the browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
      if (Array.isArray(saved) && saved.length) setHidden(new Set(saved.filter((v) => typeof v === "string")));
    } catch {
      // Unreadable storage: show everything.
    }
  }, []);

  const bySociety = useMemo(() => new Map(societies.map((s) => [s.id, s])), [societies]);
  const hostOf = (event: CommunityEvent) => {
    const s = bySociety.get(event.societyId);
    return s ? societyLabel(s.name, s.id) : "A society";
  };
  // Only societies with something coming up are worth a filter.
  const active = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.societyId, (counts.get(e.societyId) ?? 0) + 1);
    return societies
      .filter((s) => counts.has(s.id))
      .map((s) => ({ society: s, label: societyLabel(s.name, s.id), count: counts.get(s.id) ?? 0 }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [societies, events]);
  const hiddenActive = active.filter((a) => hidden.has(a.society.id)).length;

  const lastWeek = useMemo(
    () => (events.length ? mondayOf(londonDayKey(new Date(events[events.length - 1].startsAt))) : thisWeek),
    [events, thisWeek],
  );

  // Everything that passes the filters, in any week.
  const matching = useMemo(
    () => events.filter((e) => !hidden.has(e.societyId) && matchesQuery(e, hostOf(e), query)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, hidden, query, bySociety],
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDayKey(week, i)), [week]);
  const layout = useMemo(() => layoutWeek(matching, days), [matching, days]);
  const weekCount = days.reduce((n, d) => n + layout.counts[d], 0);
  const upcoming = useMemo(() => matching.filter((e) => Date.parse(e.endsAt) >= now.getTime()), [matching, now]);
  const groups = useMemo(() => groupByDay(upcoming, now), [upcoming, now]);

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
    // Only when the week or view changes; filtering shouldn't jump the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, view]);

  // The state worth sharing, in the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string | null) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    set("week", view === "week" && week !== thisWeek ? week : null);
    set("view", view === "list" ? "list" : null);
    set("q", query.trim() || null);
    set("event", open?.id ?? null);
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [week, view, query, open, thisWeek]);

  // ← → a week, T this week, / search.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || open || filtering) return;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "/") {
        event.preventDefault();
        search.current?.focus();
      } else if (view === "week" && event.key === "ArrowLeft" && week > thisWeek) {
        setWeek(shiftDayKey(week, -7));
      } else if (view === "week" && event.key === "ArrowRight" && week < lastWeek) {
        setWeek(shiftDayKey(week, 7));
      } else if (event.key === "t" || event.key === "T") {
        setWeek(thisWeek);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, week, thisWeek, lastWeek, open, filtering]);

  function saveHidden(next: Set<string>) {
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    } catch {
      // Not remembered, but still applied.
    }
  }

  function toggle(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveHidden(next);
  }

  // A search that finds nothing this week may find something in another.
  const elsewhere = view === "week" && weekCount === 0 ? upcoming.find((e) => londonDayKey(new Date(e.startsAt)) >= days[6]) : undefined;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // No clipboard: the address bar has it.
    }
  }

  const nowMinute = londonMinuteOfDay(now);
  const openSociety = open ? bySociety.get(open.societyId) : undefined;
  const openHost = open ? hostOf(open) : "";
  const count = view === "week" ? weekCount : upcoming.length;

  return (
    <div className="cal" data-view={view}>
      <div className="cal-bar">
        <div className="cal-weeknav">
          {view === "week" ? (
            <>
              <button type="button" className="icon-button" aria-label="Previous week" disabled={week <= thisWeek} onClick={() => setWeek(shiftDayKey(week, -7))}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="icon-button" aria-label="Next week" disabled={week >= lastWeek} onClick={() => setWeek(shiftDayKey(week, 7))}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <h1 className="cal-range" aria-live="polite">
                {weekRange(week)}
              </h1>
              {week !== thisWeek && (
                <button type="button" className="button small cal-today" onClick={() => setWeek(thisWeek)}>
                  Today
                </button>
              )}
            </>
          ) : (
            <h1 className="cal-range">Coming up</h1>
          )}
          <span className="cal-range-count muted">{count === 1 ? "1 event" : `${count} events`}</span>
        </div>

        <div className="cal-tools">
          <p className="cal-ticketed muted">
            <Ticket size={14} aria-hidden="true" />
            Some events may be ticketed
          </p>
          <label className="cal-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              placeholder="Search"
              aria-label="Search events"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
            />
            {query && (
              <button type="button" className="cal-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          {active.length > 1 && (
            <button
              type="button"
              className="button small cal-filter"
              aria-label={`Societies${hiddenActive ? `, ${hiddenActive} hidden` : ""}`}
              data-on={hiddenActive ? "" : undefined}
              onClick={() => setFiltering(true)}
            >
              <ListFilter size={15} aria-hidden="true" />
              <span className="cal-filter-label">Societies</span>
              {hiddenActive > 0 && <span className="cal-filter-count">{active.length - hiddenActive}/{active.length}</span>}
            </button>
          )}
          <div className="segmented cal-views" role="group" aria-label="View">
            <button type="button" className={view === "week" ? "active" : undefined} aria-pressed={view === "week"} onClick={() => setView("week")}>
              Week
            </button>
            <button type="button" className={view === "list" ? "active" : undefined} aria-pressed={view === "list"} onClick={() => setView("list")}>
              List
            </button>
          </div>
          <CalendarLinks
            feeds={[
              {
                name: "Volunteering at UCL",
                about: "Every event here, kept up to date in your own calendar",
                url: feedUrl,
                googleUrl: googleAddUrl(feedUrl),
              },
            ]}
          />
          <a className="button small cal-toolbox" aria-label="See all on Adam's Campus Toolbox" href={toolboxCalendarUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} aria-hidden="true" />
            <span className="cal-toolbox-label">See all on Adam&apos;s Campus Toolbox</span>
            <span className="cal-toolbox-short">Toolbox</span>
          </a>
        </div>
      </div>

      {view === "week" ? (
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
          {weekCount === 0 && (
            <div className="cal-empty">
              <p className="muted small">
                {query ? `Nothing matching “${query.trim()}” this week` : hiddenActive ? "Nothing this week from the societies you've picked" : "Nothing on this week"}
              </p>
              {elsewhere && (
                <button type="button" className="button small" onClick={() => setWeek(mondayOf(londonDayKey(new Date(elsewhere.startsAt))))}>
                  Next: {dayLabel(londonDayKey(new Date(elsewhere.startsAt)))}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="cal-agenda">
          {groups.length ? (
            groups.map((group) => (
              <section key={group.key} className="cal-agenda-day" aria-labelledby={`day-${group.key}`}>
                <h2 id={`day-${group.key}`} className="cal-agenda-head">
                  <span>{group.heading}</span>
                  {group.heading !== dayLabel(group.key) && <span className="muted">{dayLabel(group.key)}</span>}
                </h2>
                <ul>
                  {group.events.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className="cal-agenda-row"
                        style={societyStyle(bySociety.get(event.societyId))}
                        data-cancelled={event.cancelled ? "" : undefined}
                        onClick={() => setOpen(event)}
                      >
                        <span className="cal-agenda-time">{timeRange(event)}</span>
                        <span className="cal-swatch" aria-hidden="true" />
                        <span className="cal-agenda-body">
                          <span className="cal-agenda-title">{event.title}</span>
                          <span className="cal-agenda-meta muted">
                            {hostOf(event)}
                            {event.location ? ` · ${event.location}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="cal-empty">
              <p className="muted small">
                {query ? `Nothing coming up matching “${query.trim()}”` : hiddenActive ? "Nothing coming up from the societies you've picked" : "Nothing coming up"}
              </p>
            </div>
          )}
        </div>
      )}

      {filtering && (
        <Sheet onClose={() => setFiltering(false)} labelledBy="cal-filter-title">
          <div className="cal-filters">
            <header className="cal-filters-head">
              <h2 id="cal-filter-title">Societies</h2>
              <div className="cal-filters-bulk">
                <button type="button" className="button ghost small" onClick={() => saveHidden(new Set())} disabled={!hiddenActive}>
                  All
                </button>
                <button type="button" className="button ghost small" onClick={() => saveHidden(new Set(active.map((a) => a.society.id)))}>
                  None
                </button>
                <button type="button" className="button small primary" onClick={() => setFiltering(false)}>
                  Done
                </button>
              </div>
            </header>
            <ul className="cal-filters-list">
              {active.map(({ society, label, count: n }) => (
                <li key={society.id}>
                  <label className="cal-filters-row" style={societyStyle(society)}>
                    <input type="checkbox" checked={!hidden.has(society.id)} onChange={() => toggle(society.id)} />
                    <span className="cal-swatch" aria-hidden="true" />
                    <span className="cal-filters-name">{label}</span>
                    <span className="muted small">{n}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
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
            {open.description && <p className="cal-sheet-about">{open.description}</p>}
            <div className="cal-sheet-actions">
              {!isOwnLink(open.url) && (
                <a className="button primary" href={open.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} aria-hidden="true" />
                  Details and booking
                </a>
              )}
              <a className="button" href={googleEventUrl(open, openHost)} target="_blank" rel="noopener noreferrer">
                <CalendarPlus size={16} aria-hidden="true" />
                Google Calendar
              </a>
              <button type="button" className="button" onClick={copyLink} aria-live="polite">
                <Link2 size={16} aria-hidden="true" />
                {copied ? "Copied" : "Copy link"}
              </button>
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
  segment: DaySegment<CommunityEvent>;
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
      title={`${event.title}\n${time}${host ? ` · ${host}` : ""}${event.location ? `\n${event.location}` : ""}`}
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
