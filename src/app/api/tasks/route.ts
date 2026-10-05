import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { createTask, DONE_WINDOW_DAYS, listTasks } from "@/lib/tasks";
import { requireApiCapability } from "@/lib/session";
import { errorResponse, needsDatabase, readJson } from "../plan/http";

/**
 * `?event=<id>` → `{ tasks }`: that event's tasks, done or not. With no event,
 * every open task plus those finished in the last `DONE_WINDOW_DAYS`.
 */
export async function GET(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;

  const eventId = new URL(request.url).searchParams.get("event") ?? undefined;
  try {
    const tasks = await listTasks(
      eventId ? { eventId } : { doneSince: new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000) },
    );
    return NextResponse.json({ tasks });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Create a task → `{ task }` (201). */
export async function POST(request: Request) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  try {
    const task = await createTask(auth.member.id, body);
    await audit(auth.member.id, "planner.task.create", "task", task.id, {
      title: task.title,
      assigneeId: task.assigneeId,
      dueOn: task.dueOn,
      eventId: task.eventId,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
