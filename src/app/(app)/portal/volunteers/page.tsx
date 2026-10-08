import type { Metadata } from "next";
import { requireCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { VOLUNTEER_COLUMNS, type Volunteer } from "@/lib/volunteers";
import { VolunteersTable } from "@/components/volunteers/VolunteersTable";

export const metadata: Metadata = { title: "Volunteers" };

/** Everyone on the register, newest first, or null when it couldn't be read. */
async function loadVolunteers(): Promise<Volunteer[] | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("volunteers")
    .select(VOLUNTEER_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`[volunteers] couldn't load the register: ${error.message}`);
    return null;
  }
  return data as unknown as Volunteer[];
}

export default async function VolunteersPage() {
  await requireCapability("view_plan");
  const configured = isSupabaseConfigured();
  const volunteers = configured ? await loadVolunteers() : [];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org").replace(/\/+$/, "");

  return (
    <section className="page">
      <header className="page-head">
        <span className="micro-label">Committee</span>
        <h1>Volunteers</h1>
      </header>
      <p className="vol-intro muted small">
        Students who signed up at <a href={`${appUrl}/volunteer`}>{appUrl.replace(/^https?:\/\//, "")}/volunteer</a>, with
        how often they can help, when they&apos;re free and what they&apos;d like to do — filter to find who to ask, then
        copy their emails
      </p>
      {!configured ? (
        <div className="panel">
          <span className="micro-label">Database not configured</span>
          <p className="muted">Connect Supabase and sign-ups appear here</p>
        </div>
      ) : volunteers === null ? (
        <div className="notice bad" role="alert">
          <strong>Couldn&apos;t load the volunteers</strong>
          <p>Reload the page to try again</p>
        </div>
      ) : (
        <VolunteersTable initial={volunteers} />
      )}
    </section>
  );
}
