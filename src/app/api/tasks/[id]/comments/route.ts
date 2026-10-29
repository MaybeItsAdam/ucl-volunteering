import { NextResponse } from "next/server";
import { getTask } from "@/lib/tasks";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorResponse, needsDatabase, readJson } from "../../../plan/http";

const MAX_COMMENT = 2_000;

/**
 * POST { body } → `{ ok: true }`. A comment is a row in the audit log, so it
 * sits in the task's history among the changes. Written directly rather than
 * through `audit()`: that one is best-effort, and a comment that vanished
 * would be worse than an error.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  const raw = (body as { body?: unknown } | null)?.body;
  const comment = typeof raw === "string" ? raw.trim() : "";
  if (!comment) return NextResponse.json({ error: "Write something first" }, { status: 400 });
  if (comment.length > MAX_COMMENT) return NextResponse.json({ error: `Keep it under ${MAX_COMMENT} characters` }, { status: 400 });

  try {
    const task = await getTask((await params).id);
    if (!task) return NextResponse.json({ error: "No such task" }, { status: 404 });
    const { error: dbError } = await getSupabaseAdmin().from("audit_log").insert({
      actor_member_id: auth.member.id,
      action: "planner.task.comment",
      target_type: "task",
      target_id: task.id,
      metadata: { body: comment, title: task.title, eventId: task.eventId },
    });
    if (dbError) {
      console.error(`[tasks] couldn't save a comment: ${dbError.message}`);
      return NextResponse.json({ error: "Couldn't save that, try again" }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
