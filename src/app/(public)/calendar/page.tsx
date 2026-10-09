import type { Metadata } from "next";
import { PublicCalendar } from "@/components/public/PublicCalendar";
import { listCommunityEvents, type CommunityEvent, type CommunitySociety } from "@/lib/communityEvents";
import { isDayKey, isoWeekday, londonDayKey, mondayOf } from "@/lib/planTime";
import { isSupabaseConfigured } from "@/lib/supabase";
import "@/components/plan/plan.css";

export const metadata: Metadata = {
  title: "Volunteering calendar",
  description: "Volunteering at UCL in one calendar: VolSoc, Student Social Impact, Street Aid and more",
};

type SearchParams = { [key: string]: string | string[] | undefined };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** What's on, for everyone: a week at a time or as a list, and one feed of it all to subscribe to. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org").replace(/\/+$/, "");

  const now = new Date();
  const thisWeek = mondayOf(londonDayKey(now));
  const asked = first(params.week);
  const week = asked && isDayKey(asked) && isoWeekday(asked) === 1 && asked > thisWeek ? asked : thisWeek;

  let societies: CommunitySociety[] = [];
  let events: CommunityEvent[] = [];
  let loadError = false;
  if (isSupabaseConfigured()) {
    try {
      ({ societies, events } = await listCommunityEvents(now));
    } catch (error) {
      console.error(`[calendar] couldn't load events: ${error instanceof Error ? error.message : error}`);
      loadError = true;
    }
  }

  return (
    <section className="page cal-page">
      {loadError ? (
        <div className="notice bad" role="alert">
          <strong>Couldn&apos;t load the events</strong>
          <p>Reload the page to try again</p>
        </div>
      ) : (
        <PublicCalendar
          societies={societies}
          events={events}
          initialWeek={week}
          initialView={first(params.view) === "list" ? "list" : "week"}
          initialQuery={(first(params.q) ?? "").slice(0, 100)}
          initialEvent={first(params.event) ?? null}
          feedUrl={`${appUrl}/calendar.ics`}
          now={now.toISOString()}
        />
      )}
    </section>
  );
}
