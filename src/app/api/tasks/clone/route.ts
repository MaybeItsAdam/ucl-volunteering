import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { cloneRows } from "@/lib/cloneTasks";
import { getEvent, isUuid, listCommittee } from "@/lib/plan";
import { listTasks } from "@/lib/tasks";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { errorResponse, needsDatabase, readJson } from "../../plan/http";

/**
 * POST { fromEventId, toEventId } → `{ created }`: copy one event's items onto
 * another as fresh Backlog items, due dates keeping their distance from the
 * event. Items the target already has (same board and title) are skipped, so
 * pressing it twice doesn't double everything.
 */
export async function POST(request: Request) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  const { fromEventId, toEventId } = (body ?? {}) as { fromEventId?: unknown; toEventId?: unknown };
  if (!isUuid(fromEventId) || !isUuid(toEventId) || fromEventId === toEventId) {
    return NextResponse.json({ error: "Pick a different event to copy from" }, { status: 400 });
  }

  try {
    const [from, to, sources, existing, committee] = await Promise.all([
      getEvent(fromEventId),
      getEvent(toEventId),
      listTasks({ eventId: fromEventId }),
      listTasks({ eventId: toEventId }),
      listCommittee(),
    ]);
    if (!from || !to) return NextResponse.json({ error: "That event doesn't exist" }, { status: 404 });

    const have = new Set(existing.map((t) => `${t.board}:${t.title.toLowerCase()}`));
    const fresh = sources.filter((t) => !have.has(`${t.board}:${t.title.toLowerCase()}`));
    if (!fresh.length) return NextResponse.json({ created: 0 });

    const rows = cloneRows(fresh, from.startsAt, to.startsAt, toEventId, new Set(committee.map((m) => m.id)), auth.member.id);
    const { data, error: dbError } = await getSupabaseAdmin()
      .from("tasks")
      .insert(rows.map((r) => ({ ...r, created_by: auth.member.id })))
      .select("id,title");
    if (dbError) {
      console.error(`[tasks] clone failed: ${dbError.message}`);
      return NextResponse.json({ error: "Couldn't copy those, try again" }, { status: 500 });
    }
    await Promise.all(
      (data ?? []).map((t) => audit(auth.member.id, "planner.task.create", "task", t.id as string, { title: t.title, eventId: toEventId, copiedFrom: from.title })),
    );
    return NextResponse.json({ created: data?.length ?? 0 });
  } catch (e) {
    return errorResponse(e);
  }
}
