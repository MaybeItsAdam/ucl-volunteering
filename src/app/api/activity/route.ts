import { NextResponse } from "next/server";
import { listActivity } from "@/lib/activityStore";
import { requireApiCapability } from "@/lib/session";
import { errorResponse, needsDatabase } from "../plan/http";

/** GET /api/activity?type=task|event&id=… → `{ items }`, newest first: who did what to a task or event. */
export async function GET(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  if (type !== "task" && type !== "event") return NextResponse.json({ error: "type must be task or event" }, { status: 400 });
  try {
    return NextResponse.json({ items: await listActivity(type, params.get("id") ?? "") }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
