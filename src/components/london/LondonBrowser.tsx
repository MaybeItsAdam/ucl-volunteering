"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { badges, CAUSES, labelOf, SIGNUP_METHODS, WEEKDAYS, type Cause } from "@/lib/directory";
import { groupByPoint, matchesLondon, NO_LONDON_FILTER, placeWhen, type LondonFilter, type LondonItem } from "@/lib/london";
import type { Point } from "@/lib/placeKey";
import type { PinItem } from "@/components/timetable/TimetableMap";

// Leaflet needs `window`; the map loads in the browser only.
const PlacesMap = dynamic(() => import("@/components/timetable/TimetableMap").then((m) => m.TimetableMap), {
  ssr: false,
  loading: () => <div className="vl-map" aria-hidden="true" />,
});

const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

function eventWhen(item: Extract<LondonItem, { kind: "event" }>): string {
  return item.allDay ? day.format(new Date(item.startsAt)) : when.format(new Date(item.startsAt));
}

function toPin(item: LondonItem): PinItem {
  const detail =
    item.kind === "place" ? [item.host, placeWhen(item.entry) ?? labelOf(SIGNUP_METHODS, item.entry.signupMethod)].join(" · ") : `${eventWhen(item)} · ${item.host}`;
  return { id: item.id, title: item.title, href: item.href, external: item.external, kind: item.kind, location: item.location, detail };
}

/**
 * Volunteering in London: every place in the directory and every event coming
 * up, as one filtered list with a map beside it. On a phone only the map
 * shows, full screen above the tab bar, with a search box over it; its pins
 * carry the same links.
 */
export function LondonBrowser({ items, places }: { items: LondonItem[]; places: Record<string, Point> }) {
  const [filter, setFilter] = useState<LondonFilter>(NO_LONDON_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLLIElement>());
  const set = (patch: Partial<LondonFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const shown = useMemo(() => items.filter((i) => matchesLondon(i, filter)), [items, filter]);
  const shownPlaces = shown.filter((i) => i.kind === "place");
  const shownEvents = shown.filter((i) => i.kind === "event");
  const groups = useMemo(() => groupByPoint(shown, places).map((g) => ({ ...g, items: g.items.map(toPin) })), [shown, places]);
  const pinned = useMemo(() => new Set(groups.flatMap((g) => g.items.map((i) => i.id))), [groups]);
  const usedCauses = useMemo(() => CAUSES.filter((c) => items.some((i) => i.kind === "place" && i.entry.causes.includes(c.key))), [items]);
  const filtered = JSON.stringify(filter) !== JSON.stringify(NO_LONDON_FILTER);

  // A pin picked on the map brings its card into view.
  const fromMap = useRef(false);
  useEffect(() => {
    if (!selectedId || !fromMap.current) return;
    fromMap.current = false;
    cards.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const cardRef = (id: string) => (el: HTMLLIElement | null) => {
    if (el) cards.current.set(id, el);
    else cards.current.delete(id);
  };

  const showOnMap = (item: LondonItem) =>
    pinned.has(item.id) ? (
      <button type="button" className="button small ghost vl-locate" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id}>
        <MapPin size={13} aria-hidden="true" /> On the map
      </button>
    ) : null;

  return (
    <div className="vl">
      <div className="vl-list-col">
        <div className="dir-filters panel vl-filters">
          <input
            type="search"
            className="input"
            placeholder="Search by name, organiser, area or postcode"
            value={filter.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="Search"
          />
          <div className="segmented" role="group" aria-label="Show">
            {(
              [
                ["", "Everything"],
                ["place", "Places"],
                ["event", "Events"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter.kind === key} onClick={() => set({ kind: key })}>
                {label}
              </button>
            ))}
          </div>
          <div className="dir-filter-row">
            {usedCauses.length > 0 && (
              <label>
                <span className="micro-label">Cause</span>
                <select className="input" value={filter.cause} onChange={(e) => set({ cause: e.target.value as Cause | "" })}>
                  <option value="">Any cause</option>
                  {usedCauses.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="micro-label">I&apos;m free on</span>
              <select className="input" value={filter.day} onChange={(e) => set({ day: Number(e.target.value) })}>
                <option value={0}>Any day</option>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="dir-toggles" role="group" aria-label="Only show">
            {(
              [
                ["dropIn", "Drop-in, no sign-up"],
                ["noDbs", "No DBS needed"],
                ["remote", "Can be remote"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="dir-toggle" data-on={filter[key] ? "" : undefined}>
                <input type="checkbox" checked={filter[key]} onChange={(e) => set({ [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            {filtered && (
              <button type="button" className="button small ghost" onClick={() => setFilter(NO_LONDON_FILTER)}>
                Clear
              </button>
            )}
          </div>
        </div>

        <p className="micro-label dir-count" aria-live="polite">
          {shown.length} of {items.length} · {pinned.size} on the map
        </p>

        {shown.length === 0 ? (
          <div className="panel">
            <p className="empty">{items.length ? "Nothing matches those filters" : "Nothing listed yet. Check back soon"}</p>
          </div>
        ) : (
          <>
            {shownPlaces.length > 0 && (
              <section className="vl-section" aria-label="Places">
                <h2 className="micro-label">Places · {shownPlaces.length}</h2>
                <ul className="dir-list">
                  {shownPlaces.map((item) => {
                    if (item.kind !== "place") return null;
                    const e = item.entry;
                    const times = placeWhen(e);
                    return (
                      <li key={item.id} ref={cardRef(item.id)} className="dir-card panel" data-selected={selectedId === item.id ? "" : undefined}>
                        <span className="micro-label">{e.organisation}</span>
                        <h3>
                          <Link href={item.href}>{e.title}</Link>
                        </h3>
                        <p className="dir-summary">{e.summary}</p>
                        <ul className="dir-badges" aria-label="Key facts">
                          {badges(e).map((b) => (
                            <li key={b} className="tag">
                              {b}
                            </li>
                          ))}
                        </ul>
                        <dl className="dir-facts">
                          {times && (
                            <div>
                              <dt className="micro-label">When</dt>
                              <dd>{times}</dd>
                            </div>
                          )}
                          {(e.nearestStation || e.postcode || e.address) && (
                            <div>
                              <dt className="micro-label">Where</dt>
                              <dd>{[e.nearestStation, e.postcode].filter(Boolean).join(" · ") || e.address}</dd>
                            </div>
                          )}
                          <div>
                            <dt className="micro-label">Sign up</dt>
                            <dd>{labelOf(SIGNUP_METHODS, e.signupMethod)}</dd>
                          </div>
                        </dl>
                        {showOnMap(item)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {shownEvents.length > 0 && (
              <section className="vl-section" aria-label="Events coming up">
                <h2 className="micro-label">Events, next four weeks · {shownEvents.length}</h2>
                <ul className="dir-list">
                  {shownEvents.map((item) => {
                    if (item.kind !== "event") return null;
                    return (
                      <li
                        key={item.id}
                        ref={cardRef(item.id)}
                        className="dir-card panel vl-event"
                        data-selected={selectedId === item.id ? "" : undefined}
                        style={{ ["--vl-colour" as string]: item.colour ?? undefined }}
                      >
                        <span className="micro-label">{item.host || "Event"}</span>
                        <h3>
                          {item.external ? (
                            <a href={item.href} target="_blank" rel="noreferrer">
                              {item.title} <ExternalLink size={13} aria-hidden="true" />
                            </a>
                          ) : (
                            <Link href={item.href}>{item.title}</Link>
                          )}
                        </h3>
                        <dl className="dir-facts">
                          <div>
                            <dt className="micro-label">When</dt>
                            <dd>
                              <CalendarDays size={13} aria-hidden="true" /> {eventWhen(item)}
                            </dd>
                          </div>
                          {item.location && (
                            <div>
                              <dt className="micro-label">Where</dt>
                              <dd>{item.location}</dd>
                            </div>
                          )}
                        </dl>
                        {showOnMap(item)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <div className="vl-map-col">
        {/* Phones only: the list is hidden there, so the search sits on the map and narrows its pins. */}
        <div className="vl-map-search">
          <input
            type="search"
            className="input"
            placeholder="Search places and events"
            value={filter.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="Search the map"
          />
          {filter.q && (
            <span className="tag vl-map-count" aria-live="polite">
              {pinned.size} on the map
            </span>
          )}
        </div>
        <PlacesMap
          groups={groups}
          selectedId={selectedId}
          onSelect={(id) => {
            fromMap.current = true;
            setSelectedId(id);
          }}
          className="vl-map"
          label="Map of volunteering in London"
        />
      </div>
    </div>
  );
}
