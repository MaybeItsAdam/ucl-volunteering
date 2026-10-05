import type { Metadata } from "next";
import { after } from "next/server";
import { Availability } from "@/components/availability/Availability";
import { TimetableLink } from "@/components/availability/TimetableLink";
import { listAvailability } from "@/lib/plan";
import { londonWeek } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getTimetableStatus, refreshIfStale, timetableBlocksForWeek, type TimetableStatus } from "@/lib/timetable";
import type { AvailabilityBlock, CommitteeMember } from "@/lib/types";

export const metadata: Metadata = { title: "Availability" };

/**
 * Weekly availability: replaces the sheet's "Weekly Lack Of Availability
 * Schedule" tab. Each member marks the times they can't make; the page lays
 * everyone's over one week and suggests when to meet.
 *
 * Linked UCL timetables join the committee view as this week's lectures.
 *
 * Without a database (local development) the grid still works, but nothing
 * can be saved, and the page says so rather than failing.
 */
export default async function AvailabilityPage() {
  const member = await requireCapability("view_plan");
  const me: CommitteeMember = { id: member.id, name: member.name, colour: member.colour };

  let blocks: AvailabilityBlock[] = [];
  let members: CommitteeMember[] = [];
  let timetableBlocks: AvailabilityBlock[] = [];
  let timetableStatus: TimetableStatus | null = null;
  let problem: "no-database" | "failed" | null = null;
  if (!isSupabaseConfigured()) {
    problem = "no-database";  } else {
    try {
      ({ blocks, members } = await listAvailability());
    } catch (error) {
      console.error("[availability]", error);
      problem = "failed";
    }
    // A timetable failure loses only the lectures, never the grid.
    try {
      const ids = new Set([...members.map((m) => m.id), me.id]);
      [timetableStatus, timetableBlocks] = await Promise.all([
        getTimetableStatus(member.id),
        timetableBlocksForWeek(member.id, [...ids], londonWeek(new Date())),
      ]);
    } catch (error) {
      console.error("[availability] timetables", error);
    }
    after(() => refreshIfStale(member.id));
  }

  return (
    <section className="page">
      <header className="page-head">
        <span className="micro-label">Committee</span>
        <h1>Availability</h1>
      </header>

      {problem === "no-database" && (
        <div className="notice warn">
          <strong>No database</strong>
          <p>The grid works, but saving and everyone else&rsquo;s times need the database configured</p>
        </div>
      )}
      {problem === "failed" && (
        <div className="notice bad" role="alert">
          <strong>Couldn&rsquo;t load availability</strong>
          <p>Reload to try again — anything you mark now can&rsquo;t be saved until it loads</p>
        </div>
      )}

      <TimetableLink initialStatus={timetableStatus} />

      <Availability
        me={me}
        members={members}
        blocks={blocks}
        timetableBlocks={timetableBlocks}
        canSave={problem === null}
      />
    </section>
  );
}
