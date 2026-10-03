import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { deleteEvent, getEvent, updateEvent } from "@/lib/plan";
import { requireApiCapability } from "@/lib/session";
import { errorResponse, needsDatabase, readJson } from "../../http";

type Params = { params: Promise<{ id: string }> };

/** → `{ event }` */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  try {
    const event = await getEvent((await params).id);
    if (!event) return NextResponse.json({ error: "No such event" }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Partial update → `{ event }`. A Social Impact event takes only the
 * committee's fields (category, status, lead, links, notes, numbers); its
 * title, time and place belong to the feed.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  try {
    const { before, event, changed } = await updateEvent((await params).id, body);
    const from: Record<string, unknown> = {};
    const to: Record<string, unknown> = {};
    for (const field of changed) {
      from[field] = before[field as keyof typeof before];
      to[field] = event[field as keyof typeof event];
    }
    await audit(auth.member.id, "plan.event.update", "event", event.id, { title: event.title, from, to });
    return NextResponse.json({ event });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Delete a VolSoc event → `{ ok: true }`. Social Impact events can't be deleted (400). */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;

  try {
    const event = await deleteEvent((await params).id);
    await audit(auth.member.id, "plan.event.delete", "event", event.id, {
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      category: event.category,
      status: event.status,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
