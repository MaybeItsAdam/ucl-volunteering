import type { Metadata } from "next";
import Link from "next/link";
import { listCommittee, listEvents } from "@/lib/plan";
import { londonDayKey, termWeek, TERMS, londonDateAt, shiftDayKey } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { CATEGORY_LABELS, STATUS_LABELS, type CommitteeMember, type PlanEvent } from "@/lib/types";
import { dayLabel, myResponse, responseCounts, SOURCE_LABELS, STATUS_TAG, timeRange, weekRange } from "@/components/plan/format";
import { PlanSubnav } from "@/components/plan/PlanSubnav";
import "@/components/plan/plan.css";

export const metadata: Metadata = { title: "Plan list" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const DAY_MS = 86_400_000;

interface WeekGroup {
  monday: string;
  label: string;
  events: PlanEvent[];
}
interface TermGroup {
  label: string;
  weeks: WeekGroup[];
}

/** Events in order, grouped by term (or vacation) then by week. */
function group(events: PlanEvent[]): TermGroup[] {
  const terms: TermGroup[] = [];
  for (const event of events) {
    const tw = termWeek(londonDayKey(new Date(event.startsAt)));
    let term = terms.at(-1);
    if (!term || term.label !== tw.termLabel) {
      term = { label: tw.termLabel, weeks: [] };
      terms.push(term);
    }
    let week = term.weeks.at(-1);
    if (!week || week.monday !== tw.monday) {
      week = { monday: tw.monday, label: `${tw.label} · ${weekRange(tw.monday)}`, events: [] };
      term.weeks.push(week);
    }
    week.events.push(event);
  }
  return terms;
}

export default async function PlanListPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireCapability("view_plan");
  const showPast = (await searchParams).past === "1";
  const now = new Date();

  const dbReady = isSupabaseConfigured();
  let events: PlanEvent[] = [];
  let committee: CommitteeMember[] = [];
  let loadError: string | null = null;
  if (dbReady) {
    // Past: from a vacation before the first term we know of. Ahead: a year.
    const from = showPast ? londonDateAt(shiftDayKey(TERMS[0].start, -120), 0) : now;
    const to = new Date(now.getTime() + 366 * DAY_MS);
    try {
      [events, committee] = await Promise.all([listEvents(from, to), listCommittee()]);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "The plan couldn't be loaded";
    }
  }
  const names = new Map(committee.map((m) => [m.id, m.name]));
  const groups = group(events);

  return (
    <section className="page plan-page">
      <header className="page-head">
        <span className="micro-label">Social Impact calendar</span>
        <h1>All events</h1>
        <div className="page-actions">
          <div className="segmented" role="group" aria-label="Which events">
            <Link href="/portal/plan/list" aria-pressed={!showPast} className={!showPast ? "active" : undefined}>
              Upcoming
            </Link>
            <Link href="/portal/plan/list?past=1" aria-pressed={showPast} className={showPast ? "active" : undefined}>
              Show past
            </Link>
          </div>
        </div>
      </header>

      <PlanSubnav active="list" />

      {!dbReady && (
        <div className="notice warn">
          <strong>Database not configured</strong>
          <p>Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load the plan</p>
        </div>
      )}
      {loadError && (
        <div className="notice bad" role="alert">
          <strong>The plan couldn&apos;t be loaded</strong>
          <p>{loadError}</p>
        </div>
      )}

      {dbReady && !loadError && groups.length === 0 && (
        <div className="panel">
          <p className="empty">{showPast ? "No events yet" : "Nothing coming up"}</p>
        </div>
      )}

      {groups.map((term) => (
        <section key={term.label} className="plan-agenda-term" aria-label={term.label}>
          <h2 className="micro-label plan-agenda-termlabel">{term.label}</h2>
          {term.weeks.map((week) => (
            <div key={week.monday} className="panel flush plan-agenda-week">
              <div className="panel-head">
                <Link href={`/portal/plan?week=${week.monday}`} className="plan-agenda-weeklabel">
                  {week.label}
                </Link>
                <span className="micro-label">
                  {week.events.length} event{week.events.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="rows plan-agenda-rows">
                {week.events.map((event) => {
                  const counts = responseCounts(event);
                  const mine = myResponse(event, member.id);
                  const past = Date.parse(event.endsAt) < now.getTime();
                  const day = londonDayKey(new Date(event.startsAt));
                  return (
                    <li
                      key={event.id}
                      className="plan-agenda-row"
                      data-category={event.category}
                      data-status={event.status}
                      data-past={past ? "" : undefined}
                    >
                      <span className="plan-agenda-when">
                        <span className="plan-agenda-date">{dayLabel(day)}</span>
                        <span className="mono plan-agenda-time">{timeRange(event)}</span>
                      </span>
                      <span className="plan-agenda-main">
                        <Link href={`/portal/plan/events/${event.id}`} className="plan-agenda-title">
                          {event.title}
                        </Link>
                        <span className="plan-agenda-meta">
                          <span className="plan-cat-tag" data-category={event.category}>
                            {CATEGORY_LABELS[event.category]}
                          </span>
                          <span className="muted small">{SOURCE_LABELS[event.source]}</span>
                          {event.location && <span className="muted small">{event.location}</span>}
                        </span>
                      </span>
                      <span className="plan-agenda-lead small">
                        <span className="micro-label">Lead</span>
                        {event.leadMemberId ? (names.get(event.leadMemberId) ?? "Former member") : <span className="dim">None</span>}
                      </span>
                      <span
                        className="plan-agenda-counts mono"
                        aria-label={`${counts.going} going, ${counts.maybe} maybe, ${counts.no} can't`}
                        title={mine ? `You: ${mine}` : "You haven't answered"}
                      >
                        <span data-response="going">✓ {counts.going}</span>
                        <span data-response="maybe">? {counts.maybe}</span>
                        <span data-response="no">✕ {counts.no}</span>
                      </span>
                      <span className={STATUS_TAG[event.status]}>{STATUS_LABELS[event.status]}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </section>
  );
}
