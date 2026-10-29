import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { audit } from "@/lib/audit";
import { DIRECTORY_COLUMNS, fromRow, parseEntry, type DirectoryRow } from "@/lib/directory";
import { freeSlug } from "@/lib/directoryStore";
import { londonDayKey } from "@/lib/planTime";
import { fillPlaces } from "@/lib/places";
import { entryPlace } from "@/lib/directory";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/** Add an entry to the directory. Saving counts as checking it today. */
export async function POST(request: Request) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "The directory needs the database" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;

  const parsed = parseEntry(body);
  if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const slug = await freeSlug(parsed.value.organisation, parsed.value.title);
  const { data, error: dbError } = await getSupabaseAdmin()
    .from("directory_entries")
    .insert({ ...parsed.value, slug, verified_on: londonDayKey(new Date()), created_by: auth.member.id })
    .select(DIRECTORY_COLUMNS)
    .single();
  if (dbError) {
    console.error(`[directory] couldn't add an entry: ${dbError.message}`);
    return NextResponse.json({ error: "Couldn't save that, try again" }, { status: 500 });
  }
  const entry = fromRow(data as unknown as DirectoryRow);
  await fillPlaces([entryPlace(entry)], { limit: 1 });
  await audit(auth.member.id, "directory.create", "directory_entry", entry.id, { title: `${entry.organisation} · ${entry.title}` });
  return NextResponse.json({ entry }, { status: 201 });
}
