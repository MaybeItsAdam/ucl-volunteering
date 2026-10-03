import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { createEvent, listEvents, parseRange } from "@/lib/plan";
import { requireApiCapability } from "@/lib/session";
import { errorResponse, needsDatabase, readJson } from "../http";

/** `?from=ISO&to=ISO[&removed=1]` → `{ events }`: everything overlapping the range. */
export async function GET(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;

  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get("from"), params.get("to"));
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });
  try {
    const events = await listEvents(range.value.from, range.value.to, { includeRemoved: params.get("removed") === "1" });
    return NextResponse.json({ events });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Create a VolSoc event → `{ event }` (201). */
export async function POST(request: Request) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  try {
    const event = await createEvent(auth.member.id, body);
    await audit(auth.member.id, "plan.event.create", "event", event.id, {
      title: event.title,
      startsAt: event.startsAt,
      category: event.category,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
