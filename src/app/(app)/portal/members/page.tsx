import type { Metadata } from "next";
import { isGovernanceRole, isMemberColour } from "@/lib/access";
import { requireCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { Handover } from "@/components/members/Handover";
import { MembersAdmin } from "@/components/members/MembersAdmin";
import { StaffAccounts, type StaffRow } from "@/components/staff/StaffAccounts";
import { MEMBER_ROW_COLUMNS, sortMembers, type MemberRow } from "@/components/members/rules";

export const metadata: Metadata = { title: "Members" };

/** Everyone who has signed in, or null when the list couldn't be read. */
async function loadMembers(): Promise<MemberRow[] | null> {
  const { data, error } = await getSupabaseAdmin().from("members").select(MEMBER_ROW_COLUMNS);
  if (error) {
    console.error(`[members] couldn't load the list: ${error.message}`);
    return null;
  }
  return sortMembers(
    (data as unknown as MemberRow[]).map((row) => ({
      ...row,
      governance_role: isGovernanceRole(row.governance_role) ? row.governance_role : null,
      colour: isMemberColour(row.colour) ? row.colour : null,
    })),
  );
}

/** CH&Co staff with a code, newest first, or [] when they couldn't be read. */
async function loadStaff(): Promise<StaffRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("partner_staff")
    .select("id,name,organisation,created_at,last_seen_at,revoked_at")
    .order("created_at", { ascending: false });
  if (error) console.error(`[members] couldn't load the CH&Co staff: ${error.message}`);
  return (data ?? []) as StaffRow[];
}

export default async function MembersPage() {
  const viewer = await requireCapability("manage_members");
  const configured = isSupabaseConfigured();
  const [members, staff] = configured ? await Promise.all([loadMembers(), loadStaff()]) : [[], []];

  return (
    <section className="page">
      <header className="page-head">
        <span className="micro-label">Committee</span>
        <h1>Members</h1>
      </header>
      <p className="mem-intro muted small">
        Principals and admins come from the Toolbox organiser, UCL Volunteering Society&apos;s committee settings —
        committee seats granted here are locked, so a Toolbox sign-in won&apos;t reset them; &ldquo;Return to
        sync&rdquo; hands a seat back
      </p>
      {!configured ? (
        <div className="panel mem-state">
          <span className="micro-label">Database not configured</span>
          <p className="muted">
            No Supabase project is connected, so there is no one to list yet — set the Supabase URL and service role key
            and the members who have signed in appear here
          </p>
        </div>
      ) : members === null ? (
        <div className="notice bad" role="alert">
          <strong>Couldn&apos;t load the members</strong>
          <p>Reload the page to try again</p>
        </div>
      ) : (
        <>
          <MembersAdmin initialMembers={members} viewer={{ id: viewer.id, governanceRole: viewer.governance_role }} />
          <Handover
            people={members.map((m) => ({ id: m.id, name: m.name }))}
            committee={members.filter((m) => m.governance_role).map((m) => ({ id: m.id, name: m.name }))}
          />
          <StaffAccounts initial={staff} />
        </>
      )}
    </section>
  );
}
