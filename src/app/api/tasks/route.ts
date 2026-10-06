import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { createTask, DONE_WINDOW_DAYS, listTasks } from "@/lib/tasks";
import { requireApiCapability } from "@/lib/session";
import { TASK_BOARDS, type TaskBoard } from "@/lib/types";
import { errorResponse, needsDatabase, readJson } from "../plan/http";

/**
 * `?event=<id>` → `{ tasks }`: that event's items from both boards, finished
 * or not. With no event, every unfinished item plus those finished in the
 * last `DONE_WINDOW_DAYS`. `?board=events|documents` keeps one board's.
 */
export async function GET(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;

  const params = new URL(request.url).searchParams;
  const eventId = params.get("event") ?? undefined;
  const board = params.get("board") ?? undefined;
  if (board !== undefined && !TASK_BOARDS.includes(board as TaskBoard)) {
    return NextResponse.json({ error: `board must be one of ${TASK_BOARDS.join(", ")}` }, { status: 400 });
  }
  try {
    const tasks = await listTasks({
      ...(board ? { board: board as TaskBoard } : {}),
      ...(eventId ? { eventId } : { doneSince: new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000) }),
    });
    return NextResponse.json({ tasks });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Create an item → `{ task }` (201). `title` and `assigneeId` are required. */
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
      board: task.board,
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId,
      dueOn: task.dueOn,
      eventId: task.eventId,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
