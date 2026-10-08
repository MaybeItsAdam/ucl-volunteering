import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { nextMemberColour } from "@/lib/access";
import { audit } from "@/lib/audit";
import { RETURN_COOKIE, safeReturnPath } from "@/lib/authCallback";
import { lockedGovernanceRole } from "@/lib/roleLocks";
import { isSessionSecretConfigured, setSessionCookie } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getSocietyGovernanceRole, verifyToolboxToken } from "@/lib/toolbox";
import { MEMBER_COLUMNS, type Member } from "@/lib/types";

/**
 * Swap the Toolbox's sign-in token for a VolSoc session.
 *
 * Everyone with a UCL account gets a session and a members row, role or not:
 * someone not on the committee lands on Settings and is told to ask a
 * principal, who can then find them on the Members page and grant the seat.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== "string" || body.token.length > 8_000) {
    return NextResponse.json({ error: "Missing sign-in token" }, { status: 400 });
  }

  const identity = await verifyToolboxToken(body.token);
  if (!identity) {
    return NextResponse.json({ error: "UCL sign-in has expired or is invalid" }, { status: 401 });
  }

  if (!isSessionSecretConfigured()) {
    console.error("[auth/exchange] SESSION_SECRET is missing or shorter than 32 characters; cannot sign anyone in");
    return NextResponse.json(
      { error: "Sign-in isn't configured correctly on the site right now — tell the committee" },
      { status: 503 },
    );
  }

  // Set by /api/auth/start?next=; read once, then cleared.
  const jar = await cookies();
  const redirectTo = safeReturnPath(jar.get(RETURN_COOKIE)?.value) ?? "/portal";
  jar.delete(RETURN_COOKIE);

  const toolboxRole = getSocietyGovernanceRole(identity);
  const name = identity.name?.trim() || identity.email;

  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "The committee database is not configured" }, { status: 503 });
    }
    await setSessionCookie({
      toolboxUserId: identity.id,
      memberId: `member-${identity.id}`,
      email: identity.email,
      name,
      governanceRoleAtSignIn: toolboxRole,
    });
    return NextResponse.json({ ok: true, redirectTo });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("toolbox_user_id", identity.id)
    .maybeSingle<Member>();
  if (readError) {
    console.error(`[auth/exchange] reading member: ${readError.message}`);
    return NextResponse.json({ error: "Could not reach the committee list" }, { status: 500 });
  }

  // A committee seat a principal set by hand stands; the Toolbox can still make
  // someone principal or admin.
  const role = lockedGovernanceRole(toolboxRole, existing ?? undefined);
  let member: Member | null = null;

  if (existing) {
    const { data, error } = await supabase
      .from("members")
      .update({ email: identity.email, name, governance_role: role, last_seen_at: now })
      .eq("id", existing.id)
      .select(MEMBER_COLUMNS)
      .single<Member>();
    if (error) console.error(`[auth/exchange] updating member: ${error.message}`);
    member = data;
  } else {
    const { data: colours } = await supabase.from("members").select("colour");
    const { data, error } = await supabase
      .from("members")
      .insert({
        toolbox_user_id: identity.id,
        email: identity.email,
        name,
        governance_role: role,
        colour: nextMemberColour((colours ?? []).map((row) => row.colour as string | null)),
        last_seen_at: now,
      })
      .select(MEMBER_COLUMNS)
      .single<Member>();
    if (error) {
      // Two tabs finishing sign-in at once: the other one made the row.
      const { data: raced } = await supabase
        .from("members")
        .select(MEMBER_COLUMNS)
        .eq("toolbox_user_id", identity.id)
        .maybeSingle<Member>();
      if (!raced) console.error(`[auth/exchange] creating member: ${error.message}`);
      member = raced;
    } else {
      member = data;
    }
  }

  if (!member) {
    return NextResponse.json({ error: "Could not set up your account" }, { status: 500 });
  }

  await audit(member.id, "auth.sign_in", "member", member.id, {
    identityProvider: "adams-campus-toolbox",
    role: member.governance_role,
  });

  await setSessionCookie({
    toolboxUserId: identity.id,
    memberId: member.id,
    email: identity.email,
    name: member.name,
    governanceRoleAtSignIn: member.governance_role,
  });

  return NextResponse.json({ ok: true, redirectTo });
}
