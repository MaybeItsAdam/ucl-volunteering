import { NextResponse } from "next/server";
import { isGovernanceRole, nextMemberColour, type GovernanceRole } from "@/lib/access";
import { setSessionCookie } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { MEMBER_COLUMNS, type Member } from "@/lib/types";

/**
 * Local only: sign in without UCL. `?role=committee|principal|admin|none`
 * (default principal) picks who to be; with a database, a matching dev member
 * row is made so the rest of the app has someone real to point at.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const url = new URL(request.url);
  const asked = url.searchParams.get("role") ?? "principal";
  const role: GovernanceRole | null = isGovernanceRole(asked) ? asked : null;
  const toolboxUserId = `dev-${role ?? "none"}`;
  const email = `${toolboxUserId}@volsoc.invalid`;
  const name = `Dev ${role ? role[0].toUpperCase() + role.slice(1) : "Visitor"}`;
  const next = url.searchParams.get("next");
  const redirectTo = new URL(next?.startsWith("/") && !next.startsWith("//") ? next : "/portal", url.origin);

  let memberId = `member-${toolboxUserId}`;
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("toolbox_user_id", toolboxUserId)
      .maybeSingle<Member>();
    if (existing) {
      memberId = existing.id;
      await supabase.from("members").update({ governance_role: role }).eq("id", existing.id);
    } else {
      const { data: colours } = await supabase.from("members").select("colour");
      const { data: created, error } = await supabase
        .from("members")
        .insert({
          toolbox_user_id: toolboxUserId,
          email,
          name,
          governance_role: role,
          colour: nextMemberColour((colours ?? []).map((row) => row.colour as string | null)),
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !created) {
        return NextResponse.json({ error: `Could not create dev member: ${error?.message}` }, { status: 500 });
      }
      memberId = created.id;
    }
  }

  await setSessionCookie({ toolboxUserId, memberId, email, name, governanceRoleAtSignIn: role });
  return NextResponse.redirect(redirectTo);
}
