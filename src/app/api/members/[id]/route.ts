import { NextResponse } from "next/server";
import { isGovernanceRole } from "@/lib/access";
import { audit } from "@/lib/audit";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  auditAction,
  judgeMemberPatch,
  MEMBER_ROW_COLUMNS,
  memberUpdate,
  parseMemberPatch,
  type MemberRow,
} from "@/components/members/rules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/members/:id — one change per request:
 *   { governanceRole: "committee" | null }  seat set by hand, and locked
 *   { unlock: true }                        hand the seat back to Toolbox sign-in
 *   { colour: MemberColour }                identity hue
 * Rules: `judgeMemberPatch`. Answers `{ member: MemberRow }`.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiCapability("manage_members");
  if (auth.error) return auth.error;
  const actor = auth.member;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the body as JSON" }, { status: 400 });
  }
  const patch = parseMemberPatch(body);
  if (!patch) return NextResponse.json({ error: "Unrecognised change" }, { status: 400 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error: loadError } = await supabase.from("members").select(MEMBER_ROW_COLUMNS).eq("id", id).maybeSingle();
  if (loadError) return NextResponse.json({ error: "Couldn't load that member" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  const target = data as unknown as MemberRow;
  const targetRole = isGovernanceRole(target.governance_role) ? target.governance_role : null;

  const refusal = judgeMemberPatch(
    { id: actor.id, governanceRole: actor.governance_role },
    { id: target.id, governanceRole: targetRole, governanceRoleLocked: target.governance_role_locked },
    patch,
  );
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const { data: updated, error } = await supabase
    .from("members")
    .update(memberUpdate(patch))
    .eq("id", id)
    .select(MEMBER_ROW_COLUMNS)
    .single();
  if (error || !updated) return NextResponse.json({ error: "Couldn't save that change" }, { status: 500 });

  await audit(
    actor.id,
    auditAction(patch),
    "member",
    id,
    patch.kind === "colour"
      ? { from: target.colour, to: patch.colour }
      : patch.kind === "role"
        ? { from: targetRole, to: patch.governanceRole }
        : { role: targetRole },
  );

  return NextResponse.json({ member: updated as unknown as MemberRow });
}
