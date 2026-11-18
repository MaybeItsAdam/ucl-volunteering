import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Timetable } from "@/components/timetable/Timetable";
import { listCommunityEvents, type CommunityEvent, type CommunitySociety } from "@/lib/communityEvents";
import { entryPlace, type DirectoryEntry } from "@/lib/directory";
import { listDirectory } from "@/lib/directoryStore";
import { cachedPlaces, type Point } from "@/lib/places";
import { londonDayKey } from "@/lib/planTime";
import { isSupabaseConfigured } from "@/lib/supabase";
import "@/components/directory/directory.css";
import "@/components/timetable/timetable.css";

export const metadata: Metadata = pageMetadata({
  title: "Volunteering timetable",
  description:
    "Every regular volunteering session, drop-in and event in London this week on one timetable with a map, gathered by UCL Volunteering Society. No sign-in needed.",
  path: "/timetable",
});

// The sync and the committee change it; a five-minute-old copy is fine.
export const revalidate = 300;

export default async function TimetablePage() {
  let entries: DirectoryEntry[] = [];
  let events: CommunityEvent[] = [];
  let societies: CommunitySociety[] = [];
  let places: Record<string, Point> = {};
  let failed = false;
  if (isSupabaseConfigured()) {
    try {
      [entries, { events, societies }] = await Promise.all([listDirectory({ activeOnly: true }), listCommunityEvents()]);
      places = await cachedPlaces([...entries.flatMap((e) => [entryPlace(e), ...e.sessions.map((s) => s.where)]), ...events.map((e) => e.location)]);
    } catch (error) {
      console.error("[timetable]", error);
      failed = true;
    }
  }

  return (
    <section className="page tt-page">
      <JsonLd data={breadcrumbs([{ name: "Volunteering timetable", path: "/timetable" }])} />
      <header className="page-head">
        <span className="micro-label">This week</span>
        <h1>Volunteering timetable</h1>
      </header>
      <p className="muted pub-lede">
        Every regular session and drop-in from the <Link href="/opportunities">directory</Link>, and every event on the{" "}
        <Link href="/calendar">calendar</Link>, on one week with a map. Pick something to see where it is
      </p>
      {failed ? (
        <div className="notice bad" role="alert">
          <strong>The timetable couldn&apos;t be loaded</strong>
          <p>Try again in a minute</p>
        </div>
      ) : (
        <Timetable entries={entries} events={events} societies={societies} places={places} today={londonDayKey(new Date())} />
      )}
    </section>
  );
}
