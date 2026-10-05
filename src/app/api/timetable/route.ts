import { NextResponse } from "next/server";
import { needsDatabase, readJson } from "@/app/api/plan/http";
import { audit } from "@/lib/audit";
import { requireApiCapability } from "@/lib/session";
import { getTimetableStatus, linkTimetable, unlinkTimetable } from "@/lib/timetable";

/**
 * The caller's own UCL timetable link: GET its status, PUT a new link,
 * DELETE it. The link is never sent back, only whether there is one.
 */

export async function GET() {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  return NextResponse.json({ status: await getTimetableStatus(auth.member.id) });
}

export async function PUT(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  const { body, error } = await readJson(request);
  if (error) return error;
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string") {
    return NextResponse.json({ error: "Paste your timetable's Subscribe link" }, { status: 400 });
  }

  const result = await linkTimetable(auth.member.id, url);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await audit(auth.member.id, "timetable.link", "member", auth.member.id, { sessions: result.sessionCount });
  return NextResponse.json({ status: await getTimetableStatus(auth.member.id) });
}

export async function DELETE() {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  await unlinkTimetable(auth.member.id);
  await audit(auth.member.id, "timetable.unlink", "member", auth.member.id, {});
  return NextResponse.json({ status: await getTimetableStatus(auth.member.id) });
}
