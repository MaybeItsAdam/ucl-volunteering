import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { can, profileOf } from "@/lib/access";
import { listAvailability, listEvents } from "@/lib/plan";
import { isDayKey, londonDayKey, londonTime, londonWeek, shiftDayKey, termWeek } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { refreshIfStale, timetableBlocksForWeek } from "@/lib/timetable";
import { lastOrganiserSync } from "@/lib/toolboxEvents";
import { CATEGORY_LABELS, EVENT_CATEGORIES, type AvailabilityBlock, type CommitteeMember, type PlanEvent } from "@/lib/types";
import { dayLabel, weekRange } from "@/components/plan/format";
import { PlanSubnav } from "@/components/plan/PlanSubnav";
import { SyncStatus } from "@/components/plan/SyncStatus";
import { WeekPlanner } from "@/components/plan/WeekPlanner";

export const metadata: Metadata = { title: "Plan" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** "Synced 06:30", "Synced Fri 06:30", "Sync failed", "Never synced". */
function syncChip(last: Awaited<ReturnType<typeof lastOrganiserSync>>, today: string) {
  if (!last) return { label: "Never synced", tone: "neutral" as const, title: "The Social Impact calendar hasn't been pulled yet" };
  const at = new Date(last.finishedAt ?? last.startedAt);
  const day = londonDayKey(at);
  const when = day === today ? londonTime(at) : `${dayLabel(day)} ${londonTime(at)}`;
  if (last.ok === false) return { label: `Sync failed ${when}`, tone: "bad" as const, title: last.error ?? undefined };
  if (last.ok === null) return { label: `Syncing since ${when}`, tone: "neutral" as const };
  return { label: `Synced ${when}`, tone: "ok" as const, title: "Social Impact calendar, from the Campus Toolbox" };
}

export default async function PlanPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireCapability("view_plan");
  const profile = profileOf(member);
  const params = await searchParams;

  const now = new Date();
  const today = londonDayKey(now);
  const asked = first(params.week);
  const week = londonWeek(isDayKey(asked) ? asked : today);
  const term = termWeek(week.monday);
  const prevWeek = shiftDayKey(week.monday, -7);
  const nextWeek = shiftDayKey(week.monday, 7);
  const dayParam = Number(first(params.day));
  const initialDay = Number.isInteger(dayParam) && dayParam >= 0 && dayParam <= 6
    ? dayParam
    : week.days.includes(today)
      ? week.days.indexOf(today)
      : 0;

  const dbReady = isSupabaseConfigured();
  let events: PlanEvent[] = [];
  let members: CommitteeMember[] = [];
  let blocks: AvailabilityBlock[] = [];
  let sync: Awaited<ReturnType<typeof lastOrganiserSync>> = null;
  let loadError: string | null = null;
  if (dbReady) {
    try {
      [events, { members, blocks }, sync] = await Promise.all([
        listEvents(week.start, week.end),
        listAvailability(),
        lastOrganiserSync(),
      ]);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "The plan couldn't be loaded";
    }
    // Linked UCL timetables join the "Unavailable" overlay for this week. A
    // failure here only loses the lectures, never the plan.
    try {
      blocks = [...blocks, ...(await timetableBlocksForWeek(member.id, members.map((m) => m.id), week))];
    } catch (error) {
      console.error("[plan] timetables", error);
    }
    after(() => refreshIfStale(member.id));
  }

  const chip = dbReady ? syncChip(sync, today) : { label: "Not synced", tone: "neutral" as const, title: undefined };
  const canEdit = dbReady && can(profile, "edit_plan");
  const title = `${term.label} · ${weekRange(week.monday)}`;

  return (
    <section className="page plan-page">
      <header className="page-head">
        <span className="micro-label">VolSoc plan</span>
        <h1>{title}</h1>
        <div className="page-actions">
          <SyncStatus label={chip.label} tone={chip.tone} title={chip.title} canSync={dbReady && can(profile, "trigger_sync")} />
        </div>
      </header>

      <PlanSubnav active="week" week={week.monday} />

      <div className="plan-weekbar">
        {/* On a phone the shell's large title says "Plan" and hides the h1, so the week is named here. */}
        <h2 className="plan-phone-title">{title}</h2>
        <nav className="plan-weeknav" aria-label="Week">
          <Link className="icon-button" href={`/portal/plan?week=${prevWeek}`} aria-label="Previous week">
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <Link className="button small" href="/portal/plan" aria-current={week.days.includes(today) ? "true" : undefined}>
            Today
          </Link>
          <Link className="icon-button" href={`/portal/plan?week=${nextWeek}`} aria-label="Next week">
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </nav>
        <span className="micro-label plan-termlabel">{term.termLabel}</span>
        {canEdit && <span className="plan-hint">Drag VolSoc events to reschedule</span>}
      </div>

      {!dbReady && (
        <div className="notice warn">
          <strong>Database not configured</strong>
          <p>Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load the plan — the week below is empty until then</p>
        </div>
      )}
      {loadError && (
        <div className="notice bad" role="alert">
          <strong>The plan couldn&apos;t be loaded</strong>
          <p>{loadError}</p>
        </div>
      )}

      <WeekPlanner
        key={week.monday}
        days={week.days}
        events={events}
        serverNow={now.getTime()}
        myId={member.id}
        canEdit={canEdit}
        members={members}
        blocks={blocks}
        prevWeek={prevWeek}
        nextWeek={nextWeek}
        initialDay={initialDay}
      />

      <footer className="plan-legend">
        <ul className="plan-legend-cats" aria-label="Categories">
          {EVENT_CATEGORIES.map((c) => (
            <li key={c}>
              <span className="plan-legend-swatch category-block" data-category={c} aria-hidden="true" />
              {CATEGORY_LABELS[c]}
            </li>
          ))}
          <li>
            <span className="plan-legend-swatch plan-legend-swatch--provisional" aria-hidden="true" />
            Provisional
          </li>
        </ul>
        <p className="muted small">
          Showing {events.length} event{events.length === 1 ? "" : "s"} for {term.label} ({weekRange(week.monday)})
        </p>
      </footer>
    </section>
  );
}
