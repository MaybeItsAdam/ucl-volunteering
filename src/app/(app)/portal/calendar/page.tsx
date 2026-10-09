import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { can, profileOf } from "@/lib/access";
import { listAvailability, listEvents } from "@/lib/plan";
import { isDayKey, londonDayKey, londonTime, londonWeek, shiftDayKey, termWeek } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { calendarBlocksForWeek, getCalendarLinks, refreshIfStale, type CalendarLinksState } from "@/lib/calendarLinks";
import { volsocFeedUrl } from "@/lib/calendarFeed";
import { listCommunityEvents } from "@/lib/communityEvents";
import { DEFAULT_CALENDAR_ORGANISER_ID, DEFAULT_VOLSOC_ORGANISER_ID, lastOrganiserSync, organiserFeedUrl } from "@/lib/toolboxEvents";
import { societyLabel } from "@/components/whatson/view";
import { CATEGORY_LABELS, EVENT_CATEGORIES, type AvailabilityBlock, type CommitteeMember, type PlanEvent } from "@/lib/types";
import { dayLabel, googleAddUrl, weekRange } from "@/components/plan/format";
import { PlanSubnav } from "@/components/plan/PlanSubnav";
import { CalendarLinks, type CalendarFeedLink } from "@/components/plan/CalendarLinks";
import { SyncStatus } from "@/components/plan/SyncStatus";
import { WeekPlanner, type OtherSocietyEvent } from "@/components/plan/WeekPlanner";

export const metadata: Metadata = { title: "Schedule" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** "Synced 06:30", "Synced Fri 06:30", "Sync failed", "Never synced". */
function syncChip(last: Awaited<ReturnType<typeof lastOrganiserSync>>, today: string) {
  if (!last) return { label: "Never synced", tone: "neutral" as const, title: "The Social Impact and VolSoc calendars haven't been pulled yet" };
  const at = new Date(last.finishedAt ?? last.startedAt);
  const day = londonDayKey(at);
  const when = day === today ? londonTime(at) : `${dayLabel(day)} ${londonTime(at)}`;
  if (last.ok === false) return { label: `Sync failed ${when}`, tone: "bad" as const, title: last.error ?? undefined };
  if (last.ok === null) return { label: `Syncing since ${when}`, tone: "neutral" as const };
  return { label: `Synced ${when}`, tone: "ok" as const, title: "Social Impact and VolSoc calendars, from the Campus Toolbox" };
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
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
  // /portal/availability lands here with ?availability=edit, opening your week to edit.
  const editAvailability = first(params.availability) === "edit";

  const dbReady = isSupabaseConfigured();
  let events: PlanEvent[] = [];
  let members: CommitteeMember[] = [];
  let blocks: AvailabilityBlock[] = [];
  let calendarBlocks: AvailabilityBlock[] = [];
  let calendarLinks: CalendarLinksState | null = null;
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
    // Linked calendars (UCL timetables, personal calendars) join the
    // availability overlay for this week. A failure here only loses the busy
    // times, never the plan.
    try {
      const ids = new Set([...members.map((m) => m.id), member.id]);
      [calendarLinks, calendarBlocks] = await Promise.all([
        getCalendarLinks(member.id),
        calendarBlocksForWeek(member.id, [...ids], week),
      ]);
    } catch (error) {
      console.error("[plan] calendar links", error);
    }
    after(() => refreshIfStale(member.id));
  }

  // Other societies' events this week, from the public calendar. VolSoc's and
  // Student Social Impact's are left out: the plan already has them.
  let others: OtherSocietyEvent[] = [];
  if (dbReady) {
    try {
      const own = new Set([
        process.env.TOOLBOX_ORGANISER_ID || DEFAULT_VOLSOC_ORGANISER_ID,
        process.env.CALENDAR_ORGANISER_ID || DEFAULT_CALENDAR_ORGANISER_ID,
      ]);
      const community = await listCommunityEvents(now);
      const bySociety = new Map(community.societies.map((s) => [s.id, s]));
      const from = week.start.getTime();
      const to = week.end.getTime();
      others = community.events
        .filter((e) => !own.has(e.societyId) && !e.cancelled && Date.parse(e.endsAt) > from && Date.parse(e.startsAt) < to)
        .map((e) => {
          const society = bySociety.get(e.societyId);
          return {
            other: true as const,
            id: `other-${e.id}`,
            title: e.title,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            allDay: e.allDay,
            location: e.location,
            url: e.url,
            society: society ? societyLabel(society.name, society.id) : "Another society",
            colour: society?.colour ?? null,
            darkColour: society?.darkColour ?? null,
          };
        });
    } catch (error) {
      console.error("[plan] other societies' events", error);
    }
  }

  const chip = dbReady ? syncChip(sync, today) : { label: "Not synced", tone: "neutral" as const, title: undefined };
  const canEdit = dbReady && can(profile, "edit_plan");
  const socialImpactFeed = organiserFeedUrl();
  const volsocFeed = volsocFeedUrl(process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org");
  const feeds: CalendarFeedLink[] = [
    ...(volsocFeed
      ? [{
          name: "VolSoc calendar",
          about: "VolSoc's own events, kept up to date from this app. The link is for the committee only, so don't post it publicly",
          url: volsocFeed,
          googleUrl: googleAddUrl(volsocFeed),
        }]
      : []),
    {
      name: "Social Impact calendar",
      about: "UCL Student Social Impact's events, from Adam's Campus Toolbox. Paste the link into any calendar app that subscribes by URL",
      url: socialImpactFeed,
      googleUrl: googleAddUrl(socialImpactFeed),
    },
  ];
  const isThisWeek = week.days.includes(today);

  return (
    <section className="page plan-page">
      {/* One bar: the week, the plan's views, and the feeds and sync. */}
      <div className="plan-bar">
        <div className="plan-bar-week">
          <Link className="icon-button" href={`/portal/calendar?week=${prevWeek}`} aria-label="Previous week">
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <Link className="icon-button" href={`/portal/calendar?week=${nextWeek}`} aria-label="Next week">
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <h1 className="plan-range">{weekRange(week.monday)}</h1>
          <span className="plan-range-term muted">{term.label}</span>
          {!isThisWeek && (
            <Link className="button small" href="/portal/calendar">
              Today
            </Link>
          )}
        </div>
        <div className="plan-bar-tools">
          <PlanSubnav active="week" week={week.monday} />
          <CalendarLinks feeds={feeds} />
          <SyncStatus label={chip.label} tone={chip.tone} title={chip.title} canSync={dbReady && can(profile, "trigger_sync")} />
        </div>
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
        me={{ id: member.id, name: member.name, colour: member.colour }}
        members={members}
        blocks={blocks}
        calendarBlocks={calendarBlocks}
        calendarLinks={calendarLinks}
        canSaveAvailability={dbReady && !loadError}
        editAvailability={editAvailability}
        prevWeek={prevWeek}
        nextWeek={nextWeek}
        initialDay={initialDay}
        others={others}
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
      </footer>
    </section>
  );
}
