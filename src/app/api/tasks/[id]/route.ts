import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { deleteTask, getTask, updateTask } from "@/lib/tasks";
import { requireApiCapability } from "@/lib/session";
import { errorResponse, needsDatabase, readJson } from "../../plan/http";

type Params = { params: Promise<{ id: string }> };

/** → `{ task }` */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  try {
    const task = await getTask((await params).id);
    if (!task) return NextResponse.json({ error: "No such task" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Partial update → `{ task }`. Moving to or from Done sets or clears `completedAt`. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  try {
    const { before, task, changed } = await updateTask((await params).id, body);
    const from: Record<string, unknown> = {};
    const to: Record<string, unknown> = {};
    for (const field of changed) {
      from[field] = before[field as keyof typeof before];
      to[field] = task[field as keyof typeof task];
    }
    await audit(auth.member.id, "planner.task.update", "task", task.id, { title: task.title, from, to });
    return NextResponse.json({ task });
  } catch (e) {
    return errorResponse(e);
  }
}

/** → `{ ok: true }` */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;

  try {
    const task = await deleteTask((await params).id);
    await audit(auth.member.id, "planner.task.delete", "task", task.id, {
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId,
      dueOn: task.dueOn,
      eventId: task.eventId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
