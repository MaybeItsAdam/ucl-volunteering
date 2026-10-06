import { NextResponse } from "next/server";
import { needsDatabase, readJson } from "@/app/api/plan/http";
import { audit } from "@/lib/audit";
import { addCalendarLink, getCalendarLinks, removeCalendarLink } from "@/lib/calendarLinks";
import { isCalendarKind } from "@/lib/calendarProviders";
import { isUuid } from "@/lib/plan";
import { requireApiCapability } from "@/lib/session";

/**
 * The caller's own linked calendars: GET the list, POST a new link, DELETE
 * one by id. A link is never sent back once saved, only its provider, name
 * and sync state. Refreshing is `./refresh`.
 */

export async function GET() {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  return NextResponse.json({ state: await getCalendarLinks(auth.member.id) });
}

export async function POST(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  const { body, error } = await readJson(request);
  if (error) return error;
  const { url, kind, label } = (body ?? {}) as { url?: unknown; kind?: unknown; label?: unknown };
  if (typeof url !== "string") {
    return NextResponse.json({ error: "Paste your calendar's link" }, { status: 400 });
  }

  const result = await addCalendarLink(auth.member.id, isCalendarKind(kind) ? kind : "google", url, label);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await audit(auth.member.id, "calendar_link.add", "member", auth.member.id, {
    kind: result.link.kind,
    busy: result.link.blockCount,
  });
  return NextResponse.json({ state: await getCalendarLinks(auth.member.id) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "Say which calendar to remove" }, { status: 400 });
  if (!(await removeCalendarLink(auth.member.id, id))) {
    return NextResponse.json({ error: "That calendar isn't linked any more" }, { status: 404 });
  }
  await audit(auth.member.id, "calendar_link.remove", "member", auth.member.id, { link: id });
  return NextResponse.json({ state: await getCalendarLinks(auth.member.id) });
}
