import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { audit } from "@/lib/audit";
import { DIRECTORY_COLUMNS, fromRow, parseEntry, type DirectoryRow } from "@/lib/directory";
import { isUuid } from "@/lib/plan";
import { londonDayKey } from "@/lib/planTime";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/**
 * PATCH /api/directory/:id — either the whole entry again (saving counts as
 * checking it today), or `{ verified: true }` to mark it checked unchanged.
 * The slug never changes, so shared links keep working.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "No such entry" }, { status: 404 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The directory needs the database" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;

  const today = londonDayKey(new Date());
  let update: Record<string, unknown>;
  if ((body as { verified?: unknown })?.verified === true) {
    update = { verified_on: today };
  } else {
    const parsed = parseEntry(body);
    if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update = { ...parsed.value, verified_on: today };
  }

  const { data, error: dbError } = await getSupabaseAdmin()
    .from("directory_entries")
    .update(update)
    .eq("id", id)
    .select(DIRECTORY_COLUMNS)
    .maybeSingle();
  if (dbError) {
    console.error(`[directory] couldn't update ${id}: ${dbError.message}`);
    return NextResponse.json({ error: "Couldn't save that, try again" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "No such entry" }, { status: 404 });
  const entry = fromRow(data as unknown as DirectoryRow);
  await audit(auth.member.id, Object.keys(update).length === 1 ? "directory.verify" : "directory.update", "directory_entry", id, {
    title: `${entry.organisation} · ${entry.title}`,
  });
  return NextResponse.json({ entry });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "No such entry" }, { status: 404 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The directory needs the database" }, { status: 503 });

  const { data, error } = await getSupabaseAdmin().from("directory_entries").delete().eq("id", id).select("organisation,title").maybeSingle();
  if (error) {
    console.error(`[directory] couldn't delete ${id}: ${error.message}`);
    return NextResponse.json({ error: "Couldn't delete that, try again" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "No such entry" }, { status: 404 });
  await audit(auth.member.id, "directory.delete", "directory_entry", id, { title: `${data.organisation} · ${data.title}` });
  return NextResponse.json({ ok: true });
}
