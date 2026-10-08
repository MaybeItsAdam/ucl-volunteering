import type { CSSProperties } from "react";
import Link from "next/link";
import { Check, ExternalLink, MapPin } from "lucide-react";
import { listCommunityEvents, lastCommunitySync, type CommunityEvent, type CommunitySociety } from "@/lib/communityEvents";
import { londonDayKey, londonTime } from "@/lib/planTime";
import { isSupabaseConfigured } from "@/lib/supabase";
import { dayLabel, initials, timeRange } from "@/components/plan/format";
import {
  RANGES,
  RANGE_LABELS,
  filterEvents,
  groupByDay,
  parseRange,
  parseSocieties,
  societyLabel,
  toggleSociety,
  whatsOnHref,
} from "@/components/whatson/view";
import "@/components/whatson/whatson.css";

export type WhatsOnParams = { [key: string]: string | string[] | undefined };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The society's own colours, for its avatar ring and chip swatch only. */
function societyStyle(society: CommunitySociety | undefined): CSSProperties | undefined {
  if (!society?.colour) return undefined;
  return { "--soc": society.colour, "--soc-dark": society.darkColour ?? society.colour } as CSSProperties;
}

function SocietyAvatar({ society, name }: { society: CommunitySociety | undefined; name: string }) {
  return (
    <span className="wo-avatar" style={societyStyle(society)} aria-hidden="true">
      {initials(name)}
      {society?.logoUrl ? (
        // A logo that fails to load leaves the initials showing through.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={society.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      ) : null}
    </span>
  );
}

function EventRow({ event, society }: { event: CommunityEvent; society: CommunitySociety | undefined }) {
  const name = society ? societyLabel(society.name, society.id) : "A society";
  return (
    <li>
      <a className="wo-event" href={event.url} target="_blank" rel="noopener noreferrer">
        <span className="wo-time">{timeRange(event)}</span>
        <SocietyAvatar society={society} name={name} />
        <span className="wo-body">
          <span className={event.cancelled ? "wo-title wo-cancelled" : "wo-title"}>{event.title}</span>
          <span className="wo-meta">
            <span className="wo-society">{name}</span>
            {event.location ? (
              <span className="wo-location">
                <MapPin size={12} aria-hidden="true" />
                {event.location}
              </span>
            ) : null}
          </span>
        </span>
        {event.cancelled ? <span className="tag bad">Cancelled</span> : null}
        <ExternalLink className="wo-out" size={16} aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </li>
  );
}

/**
 * The societies' upcoming events, a day at a time, with range and society
 * filters in the URL. Both What's on (signed in) and the public /calendar
 * show it; `basePath` is the page the filter links go back to.
 */
export async function WhatsOnView({ params, basePath }: { params: WhatsOnParams; basePath: string }) {
  const now = new Date();
  const today = londonDayKey(now);

  const dbReady = isSupabaseConfigured();
  let societies: CommunitySociety[] = [];
  let events: CommunityEvent[] = [];
  let lastSync: Awaited<ReturnType<typeof lastCommunitySync>> = null;
  let loadError = false;
  if (dbReady) {
    try {
      [{ societies, events }, lastSync] = await Promise.all([listCommunityEvents(now), lastCommunitySync()]);
    } catch (error) {
      console.error(`[whats-on] couldn't load events: ${error instanceof Error ? error.message : error}`);
      loadError = true;
    }
  }

  const range = parseRange(first(params.range));
  const bySociety = new Map(societies.map((s) => [s.id, s]));
  // Chips for the societies with something coming up, whatever the range.
  const active = societies.filter((s) => events.some((e) => e.societyId === s.id));
  const activeIds = active.map((s) => s.id);
  const selected = parseSocieties(first(params.s), activeIds);
  const shown = filterEvents(events, range, selected, now);
  const days = groupByDay(shown, now);
  const syncedAt = lastSync ? new Date(lastSync.at) : null;

  return (
    <>
      {!dbReady ? (
        <div className="panel">
          <span className="micro-label">Database not configured</span>
          <p className="muted">
            No Supabase project is connected, so there are no events to show yet — set the Supabase URL and service role
            key and the societies&apos; events appear here after the next sync
          </p>
        </div>
      ) : loadError ? (
        <div className="notice bad" role="alert">
          <strong>Couldn&apos;t load the events</strong>
          <p>Reload the page to try again</p>
        </div>
      ) : (
        <>
          <nav className="wo-filters" aria-label="Filter events">
            <div className="segmented wo-range" role="group" aria-label="When">
              {RANGES.map((r) => (
                <Link
                  key={r}
                  href={whatsOnHref(r, selected, basePath)}
                  className={r === range ? "active" : undefined}
                  aria-current={r === range ? "true" : undefined}
                  scroll={false}
                >
                  {RANGE_LABELS[r]}
                </Link>
              ))}
            </div>
            {active.length > 1 ? (
              <div className="wo-chips" role="group" aria-label="Societies">
                <Link
                  href={whatsOnHref(range, [], basePath)}
                  className="wo-chip"
                  aria-current={selected.length ? undefined : "true"}
                  scroll={false}
                >
                  All societies
                </Link>
                {active.map((society) => {
                  const on = selected.includes(society.id);
                  return (
                    <Link
                      key={society.id}
                      href={whatsOnHref(range, toggleSociety(selected, society.id, activeIds), basePath)}
                      className="wo-chip"
                      aria-current={on ? "true" : undefined}
                      title={society.name}
                      scroll={false}
                    >
                      {on ? <Check size={14} aria-hidden="true" /> : <span className="wo-swatch" style={societyStyle(society)} aria-hidden="true" />}
                      {societyLabel(society.name, society.id)}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </nav>

          {days.length ? (
            <div className="wo-days">
              {days.map((day) => (
                <section key={day.key} className="wo-day" aria-labelledby={`wo-day-${day.key}`}>
                  <h2 id={`wo-day-${day.key}`} className="wo-day-head">
                    <span>{day.heading}</span>
                    {day.heading !== dayLabel(day.key) ? <span className="micro-label">{dayLabel(day.key)}</span> : null}
                  </h2>
                  <ul className="panel flush wo-list">
                    {day.events.map((event) => (
                      <EventRow key={event.id} event={event} society={bySociety.get(event.societyId)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="panel empty">
              <span className="micro-label">Nothing on</span>
              <p>
                {events.length
                  ? "No events match — try a longer range or more societies"
                  : "The societies haven't posted any upcoming events yet — check back soon"}
              </p>
              {events.length ? (
                <Link className="button small" href={whatsOnHref("all", [], basePath)} scroll={false}>
                  Show everything
                </Link>
              ) : null}
            </div>
          )}

          {syncedAt ? (
            <p className="wo-foot dim small">
              Updated {londonDayKey(syncedAt) === today ? londonTime(syncedAt) : `${dayLabel(londonDayKey(syncedAt))} ${londonTime(syncedAt)}`}
              {lastSync?.ok === false ? " — some societies couldn't be reached, so their events may be out of date" : null}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
