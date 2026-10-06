import { NextResponse } from "next/server";
import { needsDatabase, readJson } from "@/app/api/plan/http";
import { getCalendarLinks, refreshMemberLinks } from "@/lib/calendarLinks";
import { isUuid } from "@/lib/plan";
import { requireApiCapability } from "@/lib/session";

/**
 * "Sync now" for the caller's linked calendars: all of them, or `{ id }`.
 * Links fetched in the last two minutes are skipped, so the button can't be
 * used to hammer a provider.
 */

export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  const { body, error } = await readJson(request);
  if (error) return error;
  const id = (body as { id?: unknown } | null)?.id;
  if (id !== undefined && !isUuid(id)) {
    return NextResponse.json({ error: "Say which calendar to sync" }, { status: 400 });
  }
  await refreshMemberLinks(auth.member.id, id);
  return NextResponse.json({ state: await getCalendarLinks(auth.member.id) });
}
