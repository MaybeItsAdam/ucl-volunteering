import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { ALERT_COLUMNS, type CollectionAlert } from "@/lib/collections";
import { requireApiStaff } from "@/lib/staff";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/collections/:id { status: "collected" | "withdrawn" } — staff close an alert: all taken, or posted by mistake. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Alerts aren't set up yet" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;

  const status = (body as { status?: unknown } | null)?.status;
  if (status !== "collected" && status !== "withdrawn") return NextResponse.json({ error: "Unrecognised change" }, { status: 400 });

  const { data, error: dbError } = await getSupabaseAdmin()
    .from("collection_alerts")
    .update({ status })
    .eq("id", id)
    .eq("status", "open")
    .select(ALERT_COLUMNS)
    .maybeSingle<CollectionAlert>();
  if (dbError) return NextResponse.json({ error: "Something went wrong, try again" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "That one's already closed" }, { status: 404 });
  return NextResponse.json({ alert: data });
}
