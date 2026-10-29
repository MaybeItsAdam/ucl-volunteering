import { NextResponse } from "next/server";
import { isUuid } from "@/lib/plan";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { needsDatabase, readJson } from "../../plan/http";

/**
 * POST { fromId, toId } → `{ moved }`: hand every unfinished item one member
 * owns to another committee member (a leaver's, at handover). Each item gets a
 * line in its own history. Principals and admins only, like the Members page.
 */
export async function POST(request: Request) {
  const auth = await requireApiCapability("manage_members");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  const { fromId, toId } = (body ?? {}) as { fromId?: unknown; toId?: unknown };
  if (!isUuid(fromId) || !isUuid(toId) || fromId === toId) return NextResponse.json({ error: "Pick someone else to hand them to" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: target } = await supabase.from("members").select("id").eq("id", toId).not("governance_role", "is", null).maybeSingle();
  if (!target) return NextResponse.json({ error: "Items can only go to someone on the committee" }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from("tasks")
    .update({ assignee_member_id: toId })
    .eq("assignee_member_id", fromId)
    .is("completed_at", null)
    .select("id,title,event_id");
  if (dbError) {
    console.error(`[tasks] reassign failed: ${dbError.message}`);
    return NextResponse.json({ error: "Couldn't hand those on, try again" }, { status: 500 });
  }
  const moved = data ?? [];
  if (moved.length) {
    const { error: logError } = await supabase.from("audit_log").insert(
      moved.map((t) => ({
        actor_member_id: auth.member.id,
        action: "planner.task.reassign",
        target_type: "task",
        target_id: t.id as string,
        metadata: { fromId, toId, title: t.title, eventId: t.event_id },
      })),
    );
    if (logError) console.error(`[tasks] reassign wasn't logged: ${logError.message}`);
  }
  return NextResponse.json({ moved: moved.length });
}
