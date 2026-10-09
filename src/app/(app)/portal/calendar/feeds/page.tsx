import type { Metadata } from "next";
import Link from "next/link";
import { listPublicCalendarSources, type PublicCalendarSource } from "@/lib/communityFeeds";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PlanSubnav } from "@/components/plan/PlanSubnav";
import { PublicCalendarSources } from "@/components/plan/PublicCalendarSources";
import "@/components/plan/plan.css";

export const metadata: Metadata = { title: "Public calendar" };

export default async function PublicCalendarFeedsPage() {
  await requireCapability("edit_plan");
  const configured = isSupabaseConfigured();
  let sources: PublicCalendarSource[] = [];
  let loadError = false;
  if (configured) {
    try {
      sources = await listPublicCalendarSources();
    } catch (error) {
      console.error(`[feeds] couldn't load: ${error instanceof Error ? error.message : error}`);
      loadError = true;
    }
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org").replace(/\/+$/, "");

  return (
    <section className="page">
      <PlanSubnav active="feeds" />
      <p className="muted small pcs-intro">
        What feeds <Link href="/calendar">the public calendar</Link>, synced every morning. Anyone can subscribe to the
        lot at <code>{appUrl}/calendar.ics</code>
      </p>
      {!configured ? (
        <div className="notice warn">
          <strong>Database not configured</strong>
        </div>
      ) : loadError ? (
        <div className="notice bad" role="alert">
          <strong>Couldn&apos;t load the calendars</strong>
          <p>Reload the page to try again</p>
        </div>
      ) : (
        <PublicCalendarSources initial={sources} />
      )}
    </section>
  );
}
