import type { Metadata } from "next";
import { VolunteerForm } from "@/components/public/VolunteerForm";
import { getCurrentMember } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { VOLUNTEER_COLUMNS, type Volunteer } from "@/lib/volunteers";

export const metadata: Metadata = {
  title: "Volunteer with us",
  description: "Join UCL Volunteering Society's volunteer list: tell us when you're free and what you'd like to do",
};

/** Your sign-up so far, to fill the form with, or null for a first one. */
async function loadOwn(memberId: string): Promise<Volunteer | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("volunteers")
    .select(VOLUNTEER_COLUMNS)
    .eq("member_id", memberId)
    .maybeSingle<Volunteer>();
  if (error) console.error(`[volunteer] couldn't load a sign-up: ${error.message}`);
  return data ?? null;
}

export default async function VolunteerPage() {
  const member = await getCurrentMember();
  const existing = member ? await loadOwn(member.id) : null;

  return (
    <section className="page narrow">
      <header className="page-head">
        <span className="micro-label">Join in</span>
        <h1>Volunteer with us</h1>
      </header>
      <p className="muted pub-lede">
        Whether you&apos;ve got one afternoon this year or a few hours every week, tell us when you&apos;re free and what
        you&apos;d enjoy, and we&apos;ll get in touch when something fits
      </p>
      {member ? (
        <VolunteerForm signedInAs={{ name: member.name, email: member.email ?? "" }} existing={existing} />
      ) : (
        <div className="panel pub-signin">
          <span className="micro-label">Sign in first</span>
          <p>
            Signing up takes your UCL login, so we know every name on the list is a UCL student and you can come back and
            change your answers any time
          </p>
          <a className="button primary" href="/api/auth/start?next=/volunteer">
            Continue with UCL sign-in
          </a>
        </div>
      )}
    </section>
  );
}
