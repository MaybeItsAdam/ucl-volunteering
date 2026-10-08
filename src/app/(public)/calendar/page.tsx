import type { Metadata } from "next";
import Link from "next/link";
import { CalendarLinks } from "@/components/plan/CalendarLinks";
import { googleAddUrl } from "@/components/plan/format";
import { PublicWeek } from "@/components/public/PublicWeek";
import { WhatsOnView, type WhatsOnParams } from "@/components/whatson/WhatsOnView";
import { listCommunityEvents, type CommunityEvent, type CommunitySociety } from "@/lib/communityEvents";
import { isDayKey, isoWeekday, londonDayKey, mondayOf } from "@/lib/planTime";
import { PUBLIC_CALENDAR_NAME } from "@/lib/publicCalendar";
import { isSupabaseConfigured } from "@/lib/supabase";
import "@/components/plan/plan.css";

export const metadata: Metadata = {
  title: "Volunteering calendar",
  description: "Volunteering at UCL in one calendar: VolSoc, Student Social Impact, Street Aid and more",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** What's on, for everyone: a week at a time (or as a list), and one feed of it all to subscribe to. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<WhatsOnParams> }) {
  const params = await searchParams;
  const view = first(params.view) === "list" ? "list" : "week";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org").replace(/\/+$/, "");
  const feedUrl = `${appUrl}/calendar.ics`;

  const now = new Date();
  const thisWeek = mondayOf(londonDayKey(now));
  const asked = first(params.week);
  const week = asked && isDayKey(asked) && isoWeekday(asked) === 1 && asked > thisWeek ? asked : thisWeek;

  let societies: CommunitySociety[] = [];
  let events: CommunityEvent[] = [];
  let loadError = false;
  if (view === "week" && isSupabaseConfigured()) {
    try {
      ({ societies, events } = await listCommunityEvents(now));
    } catch (error) {
      console.error(`[calendar] couldn't load events: ${error instanceof Error ? error.message : error}`);
      loadError = true;
    }
  }

  return (
    <section className="page wo-page cal-page">
      <header className="page-head">
        <span className="micro-label">Volunteering at UCL</span>
        <h1>Calendar</h1>
        <div className="page-actions">
          <nav className="segmented" aria-label="View">
            <Link href="/calendar" className={view === "week" ? "active" : undefined} aria-current={view === "week" ? "page" : undefined}>
              Week
            </Link>
            <Link href="/calendar?view=list" className={view === "list" ? "active" : undefined} aria-current={view === "list" ? "page" : undefined}>
              List
            </Link>
          </nav>
          <CalendarLinks
            feeds={[
              {
                name: PUBLIC_CALENDAR_NAME,
                about: "Every event here, kept up to date in your own calendar",
                url: feedUrl,
                googleUrl: googleAddUrl(feedUrl),
              },
            ]}
          />
        </div>
      </header>
      <p className="cal-intro muted small">
        Events from VolSoc, UCL Student Social Impact and UCL&apos;s social impact societies, like Street Aid, Red Cross
        and Student Action for Refugees
      </p>
      {view === "list" ? (
        <WhatsOnView params={params} basePath="/calendar" />
      ) : loadError ? (
        <div className="notice bad" role="alert">
          <strong>Couldn&apos;t load the events</strong>
          <p>Reload the page to try again</p>
        </div>
      ) : (
        <PublicWeek societies={societies} events={events} initialWeek={week} now={now.toISOString()} />
      )}
    </section>
  );
}
