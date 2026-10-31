import type { Metadata } from "next";
import Link from "next/link";
import { LondonBrowser } from "@/components/london/LondonBrowser";
import { listCommunityEvents } from "@/lib/communityEvents";
import { entryPlace, type DirectoryEntry } from "@/lib/directory";
import { listDirectory } from "@/lib/directoryStore";
import { placeItems, upcomingEvents, type LondonItem } from "@/lib/london";
import { cachedPlaces, type Point } from "@/lib/places";
import { isSupabaseConfigured } from "@/lib/supabase";
import "@/components/directory/directory.css";
import "@/components/timetable/timetable.css";
import "@/components/london/london.css";

export const metadata: Metadata = {
  title: "Volunteer in London",
  description:
    "Places to volunteer across London and volunteering events coming up, on one list and one map: drop-in times, how to sign up and whether you need a DBS, checked by UCL Volunteering Society",
};

// The committee and the sync change it; a five-minute-old copy is fine.
export const revalidate = 300;

export default async function OpportunitiesPage() {
  let entries: DirectoryEntry[] = [];
  let items: LondonItem[] = [];
  let places: Record<string, Point> = {};
  let failed = false;
  if (isSupabaseConfigured()) {
    try {
      entries = await listDirectory({ activeOnly: true });
      items = placeItems(entries);
      // The calendar's events are a second source: if they fail, the directory still shows.
      try {
        const { events, societies } = await listCommunityEvents();
        items = [...items, ...upcomingEvents(events, societies, new Date())];
      } catch (error) {
        console.error("[opportunities] events", error);
      }
      places = await cachedPlaces([...entries.flatMap((e) => [entryPlace(e), ...e.sessions.map((s) => s.where)]), ...items.map((i) => i.location)]);
    } catch (error) {
      console.error("[opportunities]", error);
      failed = true;
    }
  }

  return (
    <section className="page vl-page">
      <header className="page-head">
        <span className="micro-label">Directory and events</span>
        <h1>Volunteer in London</h1>
      </header>
      <p className="muted pub-lede">
        Places across London that take volunteers, checked by the committee, and every volunteering event coming up from
        the <Link href="/calendar">calendar</Link>. Search the list, or find something near you on the map. Week by week
        it&apos;s on the <Link href="/timetable">timetable</Link>. Know somewhere that should be here?{" "}
        <Link href="/volunteer">Tell us</Link>
      </p>
      {failed ? (
        <div className="notice bad" role="alert">
          <strong>The directory couldn&apos;t be loaded</strong>
          <p>Try again in a minute</p>
        </div>
      ) : (
        <LondonBrowser items={items} places={places} />
      )}
    </section>
  );
}
