"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, X } from "lucide-react";
import { layoutWeek, PX_PER_MINUTE, WINDOW_END, WINDOW_START } from "@/components/plan/layout";
import { CAUSES, type Cause, type DirectoryEntry } from "@/lib/directory";
import type { CommunityEvent, CommunitySociety } from "@/lib/communityEvents";
import type { Point } from "@/lib/placeKey";
import { formatMinute, mondayOf, shiftDayKey } from "@/lib/planTime";
import {
  eventItems,
  groupByPlace,
  matchesTimetable,
  NO_FILTER,
  sessionItems,
  type TimeOfDay,
  type TimetableFilter,
  type TimetableItem,
} from "@/lib/timetable";

// Leaflet needs `window`; the map loads in the browser only.
const TimetableMap = dynamic(() => import("./TimetableMap").then((m) => m.TimetableMap), {
  ssr: false,
  loading: () => <div className="tt-map tt-map-loading" aria-hidden="true" />,
});

const PHONE = "(max-width: 900px)";
function usePhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = window.matchMedia(PHONE);
      q.addEventListener("change", onChange);
      return () => q.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dayNum = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

const asDate = (key: string) => new Date(`${key}T12:00:00Z`);

function weekLabel(monday: string): string {
  const sunday = shiftDayKey(monday, 6);
  const a = asDate(monday);
  const b = asDate(sunday);
  return monthName.format(a) === monthName.format(b)
    ? `${dayNum.format(a)}–${dayNum.format(b)} ${monthName.format(b)}`
    : `${dayNum.format(a)} ${monthName.format(a)} – ${dayNum.format(b)} ${monthName.format(b)}`;
}

const TIMES: { key: TimeOfDay; label: string }[] = [
  { key: "", label: "Any time" },
  { key: "morning", label: "Mornings" },
  { key: "afternoon", label: "Afternoons" },
  { key: "evening", label: "Evenings" },
];

const HOURS = Array.from({ length: (WINDOW_END - WINDOW_START) / 60 }, (_, i) => WINDOW_START + i * 60);

/**
 * Everything on in a week, on one timetable with a map beside it: the
 * directory's regular sessions and drop-ins, and the volunteering calendar's
 * events. Picking a block shows its pin; picking a pin shows what's there.
 */
export function Timetable({
  entries,
  events,
  societies,
  places,
  today,
}: {
  entries: DirectoryEntry[];
  events: CommunityEvent[];
  societies: CommunitySociety[];
  places: Record<string, Point>;
  today: string;
}) {
  const phone = usePhone();
  const thisMonday = mondayOf(today);
  const [monday, setMonday] = useState(thisMonday);
  const [filter, setFilter] = useState<TimetableFilter>(NO_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState<"day" | "map">("day");
  const [phoneDay, setPhoneDay] = useState(() => Math.max(0, Math.round((asDate(today).getTime() - asDate(thisMonday).getTime()) / 86_400_000)));
  const set = (patch: Partial<TimetableFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDayKey(monday, i)), [monday]);
  const all = useMemo(() => [...sessionItems(entries, monday), ...eventItems(events, societies, monday)], [entries, events, societies, monday]);
  const shown = useMemo(() => all.filter((i) => matchesTimetable(i, filter)), [all, filter]);
  const visibleDays = useMemo(() => (phone ? [days[phoneDay]] : days), [phone, days, phoneDay]);
  const layout = useMemo(() => layoutWeek(shown, visibleDays), [shown, visibleDays]);
  const groups = useMemo(() => groupByPlace(shown, places), [shown, places]);
  const unplaced = shown.filter((i) => !i.place || !places[i.place]).length;
  const selected = shown.find((i) => i.id === selectedId) ?? null;

  const hosts = useMemo(() => [...new Set(all.map((i) => i.host).filter(Boolean))].sort(), [all]);
  const causes = useMemo(() => CAUSES.filter((c) => all.some((i) => i.causes.includes(c.key))), [all]);
  const filtered = JSON.stringify(filter) !== JSON.stringify(NO_FILTER);

  function go(weeks: number) {
    setMonday((m) => shiftDayKey(m, weeks * 7));
    setSelectedId(null);
  }

  const pick = (id: string) => setSelectedId(id);

  const detail = selected && (
    <section className="panel tt-detail" aria-label="Selected">
      <button type="button" className="button small ghost tt-detail-close" onClick={() => setSelectedId(null)} aria-label="Close">
        <X size={14} aria-hidden="true" />
      </button>
      <span className="micro-label">{selected.kind === "session" ? "Regular session" : "Event"} · {selected.host}</span>
      <h2>{selected.title}</h2>
      <p className="muted small">
        {longDay.format(new Date(selected.startsAt))}
        {!selected.allDay && ` · ${clock.format(new Date(selected.startsAt))}–${clock.format(new Date(selected.endsAt))}`}
      </p>
      {selected.location && (
        <p className="small">
          <MapPin size={13} aria-hidden="true" /> {selected.location}
        </p>
      )}
      {(selected.signup || selected.note) && <p className="small">{[selected.signup, selected.note].filter(Boolean).join(" · ")}</p>}
      {selected.external ? (
        <a className="button small" href={selected.href} target="_blank" rel="noreferrer">
          Event page <ExternalLink size={13} aria-hidden="true" />
        </a>
      ) : (
        <Link className="button small primary" href={selected.href}>
          How to sign up
        </Link>
      )}
    </section>
  );

  const map = (
    <div className="tt-map-col">
      {detail}
      <TimetableMap groups={groups} selectedId={selectedId} onSelect={pick} />
      {unplaced > 0 && (
        <p className="muted small">
          {unplaced} {unplaced === 1 ? "thing isn't" : "things aren't"} on the map: online, or the place hasn&apos;t been looked up yet
        </p>
      )}
    </div>
  );

  return (
    <div className="tt">
      <div className="tt-bar">
        <div className="tt-week">
          <button type="button" className="button small ghost" onClick={() => go(-1)} aria-label="Previous week">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <strong className="tt-week-label">{weekLabel(monday)}</strong>
          <button type="button" className="button small ghost" onClick={() => go(1)} aria-label="Next week">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          {monday !== thisMonday && (
            <button type="button" className="button small" onClick={() => go((Date.parse(thisMonday) - Date.parse(monday)) / (7 * 86_400_000))}>
              This week
            </button>
          )}
        </div>
        <span className="micro-label" aria-live="polite">
          {shown.length} of {all.length} this week
        </span>
      </div>

      <div className="tt-filters panel">
        <input
          type="search"
          className="input tt-search"
          placeholder="Search by name, organiser or place"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
          aria-label="Search"
        />
        <div className="segmented" role="group" aria-label="Show">
          {(
            [
              ["", "Everything"],
              ["session", "Regular & drop-ins"],
              ["event", "Events"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter.kind === key} onClick={() => set({ kind: key })}>
              {label}
            </button>
          ))}
        </div>
        <select className="input" value={filter.time} onChange={(e) => set({ time: e.target.value as TimeOfDay })} aria-label="Time of day">
          {TIMES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        {causes.length > 0 && (
          <select className="input" value={filter.cause} onChange={(e) => set({ cause: e.target.value as Cause | "" })} aria-label="Cause">
            <option value="">Any cause</option>
            {causes.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <select className="input" value={filter.host} onChange={(e) => set({ host: e.target.value })} aria-label="Organiser">
          <option value="">Any organiser</option>
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <label className="dir-toggle" data-on={filter.dropIn ? "" : undefined}>
          <input type="checkbox" checked={filter.dropIn} onChange={(e) => set({ dropIn: e.target.checked })} />
          Drop-in, no sign-up
        </label>
        <label className="dir-toggle" data-on={filter.noDbs ? "" : undefined}>
          <input type="checkbox" checked={filter.noDbs} onChange={(e) => set({ noDbs: e.target.checked })} />
          No DBS needed
        </label>
        {filtered && (
          <button type="button" className="button small ghost" onClick={() => setFilter(NO_FILTER)}>
            Clear
          </button>
        )}
      </div>

      {phone && (
        <div className="segmented tt-phone-switch" role="group" aria-label="View">
          <button type="button" aria-pressed={phoneView === "day"} onClick={() => setPhoneView("day")}>
            Timetable
          </button>
          <button type="button" aria-pressed={phoneView === "map"} onClick={() => setPhoneView("map")}>
            Map
          </button>
        </div>
      )}

      <div className="tt-body">
        {(!phone || phoneView === "day") && (
          <div className="tt-grid-col">
            {phone && (
              <div className="tt-days" role="tablist" aria-label="Day">
                {days.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={i === phoneDay}
                    onClick={() => setPhoneDay(i)}
                    data-today={d === today ? "" : undefined}
                  >
                    <span className="micro-label">{dayName.format(asDate(d))}</span>
                    <span>{dayNum.format(asDate(d))}</span>
                  </button>
                ))}
              </div>
            )}
            {phone && detail}
            <div className="tt-grid panel flush" style={{ ["--tt-days" as string]: visibleDays.length }}>
              <div className="tt-head">
                <span />
                {visibleDays.map((d) => (
                  <span key={d} className="tt-head-day" data-today={d === today ? "" : undefined}>
                    <span className="micro-label">{dayName.format(asDate(d))}</span> {dayNum.format(asDate(d))}
                  </span>
                ))}
              </div>
              {layout.allDay.length > 0 && (
                <div className="tt-allday">
                  <span className="micro-label">All day</span>
                  <div className="tt-allday-track">
                    {layout.allDay.map((a) => (
                      <button
                        key={a.event.id}
                        type="button"
                        className="tt-block tt-block-allday"
                        data-kind={a.event.kind}
                        data-selected={a.event.id === selectedId ? "" : undefined}
                        style={{ gridColumn: `${a.firstDay + 1} / ${a.lastDay + 2}`, gridRow: a.row + 1, ["--tt-colour" as string]: a.event.colour ?? undefined }}
                        onClick={() => pick(a.event.id)}
                      >
                        {a.event.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="tt-scroll">
                <div className="tt-canvas" style={{ height: (WINDOW_END - WINDOW_START) * PX_PER_MINUTE }}>
                  <div className="tt-gutter" aria-hidden="true">
                    {HOURS.map((h) => (
                      <span key={h} style={{ top: (h - WINDOW_START) * PX_PER_MINUTE }}>
                        {formatMinute(h)}
                      </span>
                    ))}
                  </div>
                  {visibleDays.map((d) => (
                    <div key={d} className="tt-day" data-today={d === today ? "" : undefined}>
                      {(layout.days[d] ?? []).map((seg) => (
                        <Block key={`${seg.event.id}:${d}`} item={seg.event} seg={seg} selected={seg.event.id === selectedId} onPick={pick} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {shown.length === 0 && (
                <p className="empty">{all.length ? "Nothing this week matches those filters" : "Nothing on the timetable this week yet"}</p>
              )}
            </div>
          </div>
        )}
        {(!phone || phoneView === "map") && map}
      </div>
    </div>
  );
}

function Block({
  item,
  seg,
  selected,
  onPick,
}: {
  item: TimetableItem;
  seg: { top: number; bottom: number; left: number; width: number; z: number };
  selected: boolean;
  onPick: (id: string) => void;
}) {
  const height = (seg.bottom - seg.top) * PX_PER_MINUTE;
  return (
    <button
      type="button"
      className="tt-block"
      data-kind={item.kind}
      data-selected={selected ? "" : undefined}
      style={{
        top: (seg.top - WINDOW_START) * PX_PER_MINUTE,
        height,
        left: `${seg.left * 100}%`,
        width: `${seg.width * 100}%`,
        zIndex: selected ? 50 : seg.z,
        ["--tt-colour" as string]: item.colour ?? undefined,
      }}
      onClick={() => onPick(item.id)}
      aria-pressed={selected}
    >
      <span className="tt-block-time mono">{clock.format(new Date(item.startsAt))}</span>
      <span className="tt-block-title">{item.title}</span>
      {height >= 44 && <span className="tt-block-host">{item.host}</span>}
    </button>
  );
}
