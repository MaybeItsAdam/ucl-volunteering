import { DIRECTORY_COLUMNS, fromRow, slugify, type DirectoryEntry, type DirectoryRow } from "@/lib/directory";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/** Every entry, organisation then title; the public page passes `activeOnly`. */
export async function listDirectory({ activeOnly }: { activeOnly: boolean }): Promise<DirectoryEntry[]> {
  if (!isSupabaseConfigured()) return [];
  let query = getSupabaseAdmin().from("directory_entries").select(DIRECTORY_COLUMNS).order("organisation").order("title");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(`directory: ${error.message}`);
  return (data as unknown as DirectoryRow[]).map(fromRow);
}

export async function getDirectoryEntry(slug: string): Promise<DirectoryEntry | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin().from("directory_entries").select(DIRECTORY_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`directory: ${error.message}`);
  return data ? fromRow(data as unknown as DirectoryRow) : null;
}

/** A slug for a new entry, with -2, -3… when the obvious one is taken. */
export async function freeSlug(organisation: string, title: string): Promise<string> {
  const base = slugify(organisation, title);
  const { data } = await getSupabaseAdmin().from("directory_entries").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug as string));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
