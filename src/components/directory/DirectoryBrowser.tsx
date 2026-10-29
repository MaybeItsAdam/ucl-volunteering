"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import {
  badges,
  CAUSES,
  EMPTY_FILTER,
  labelOf,
  matchesFilter,
  sessionLabel,
  SIGNUP_METHODS,
  WEEKDAYS,
  type Cause,
  type DirectoryEntry,
  type DirectoryFilter,
} from "@/lib/directory";

/**
 * The directory, filtered in the browser (it's a curated list, tens of
 * entries, not thousands). Every card carries the practical facts — when,
 * where, how to sign up, DBS, age — so nobody has to open each one to find out.
 */
export function DirectoryBrowser({ entries }: { entries: DirectoryEntry[] }) {
  const [filter, setFilter] = useState<DirectoryFilter>(EMPTY_FILTER);
  const shown = useMemo(() => entries.filter((e) => matchesFilter(e, filter)), [entries, filter]);
  const usedCauses = useMemo(() => CAUSES.filter((c) => entries.some((e) => e.causes.includes(c.key))), [entries]);
  const set = (patch: Partial<DirectoryFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <div className="dir">
      <div className="dir-filters panel">
        <label className="dir-search">
          <span className="sr-only">Search</span>
          <input
            type="search"
            className="input"
            placeholder="Search by name, area or postcode"
            value={filter.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </label>
        <div className="dir-filter-row">
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
        </div>
      </div>

      <p className="micro-label dir-count" aria-live="polite">
        {shown.length} of {entries.length} {entries.length === 1 ? "place" : "places"}
      </p>

      {shown.length === 0 ? (
        <div className="panel">
          <p className="empty">Nothing matches those filters</p>
          <button type="button" className="button small" onClick={() => setFilter(EMPTY_FILTER)}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="dir-list">
          {shown.map((e) => (
            <li key={e.id} className="dir-card panel">
              <span className="micro-label">{e.organisation}</span>
              <h2>
                <Link href={`/opportunities/${e.slug}`}>{e.title}</Link>
              </h2>
              <p className="dir-summary">{e.summary}</p>
              <ul className="dir-badges" aria-label="Key facts">
                {badges(e).map((b) => (
                  <li key={b} className="tag">
                    {b}
                  </li>
                ))}
              </ul>
              <dl className="dir-facts">
                {e.sessions.length > 0 && (
                  <div>
                    <dt className="micro-label">When</dt>
                    <dd>{e.sessions.map(sessionLabel).join(" · ")}</dd>
                  </div>
                )}
                {(e.nearestStation || e.postcode || e.address) && (
                  <div>
                    <dt className="micro-label">Where</dt>
                    <dd>
                      <MapPin size={13} aria-hidden="true" /> {[e.nearestStation, e.postcode].filter(Boolean).join(" · ") || e.address}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="micro-label">Sign up</dt>
                  <dd>{labelOf(SIGNUP_METHODS, e.signupMethod)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
