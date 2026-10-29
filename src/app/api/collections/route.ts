import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import {
  ALERT_COLUMNS,
  MAX_ALERTS_PER_DAY,
  parseCollectionPost,
  pushMessage,
  whatsappLink,
  whatsappText,
  type CollectionAlert,
} from "@/lib/collections";
import { pushToEveryone } from "@/lib/push";
import { requireApiStaff } from "@/lib/staff";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/** What's on offer right now: open and not past its time. Public; it's on the Zero Food Waste page. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ alerts: [] });
  const { data, error } = await getSupabaseAdmin()
    .from("collection_alerts")
    .select(ALERT_COLUMNS)
    .eq("status", "open")
    .gt("collect_by", new Date().toISOString())
    .order("collect_by");
  if (error) return NextResponse.json({ error: "Couldn't load what's available" }, { status: 500 });
  return NextResponse.json({ alerts: data as CollectionAlert[] }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/collections — a CH&Co staff member says food is ready. Saves it,
 * then pushes it to every phone that opted in. The push can fail without
 * losing the post: the answer says how many phones it reached and carries the
 * WhatsApp message and link for the staff member to share with the group.
 */
export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Alerts aren't set up yet" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;

  const parsed = parseCollectionPost(body);
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { outlet, what, note, minutes } = parsed.value;

  const supabase = getSupabaseAdmin();
  // A stolen code shouldn't be able to buzz every volunteer's phone all day.
  const { count } = await supabase
    .from("collection_alerts")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", auth.staff.id)
    .gt("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  if ((count ?? 0) >= MAX_ALERTS_PER_DAY) {
    return NextResponse.json({ error: "That's a lot of alerts for one day — ask the committee if you need more" }, { status: 429 });
  }

  const collectBy = new Date(Date.now() + minutes * 60_000).toISOString();
  const { data, error: dbError } = await supabase
    .from("collection_alerts")
    .insert({ staff_id: auth.staff.id, outlet, what, note, collect_by: collectBy })
    .select(ALERT_COLUMNS)
    .single<CollectionAlert>();
  if (dbError) {
    console.error(`[collections] couldn't save an alert: ${dbError.message}`);
    return NextResponse.json({ error: "Something went wrong, try again in a minute" }, { status: 500 });
  }

  const push = await pushToEveryone({ ...pushMessage(data), url: "/zero-food-waste" }).catch((e) => {
    console.error(`[collections] push failed: ${e instanceof Error ? e.message : e}`);
    return { sent: 0, failed: 0, skipped: 0 };
  });
  await supabase.from("collection_alerts").update({ notified: push.sent }).eq("id", data.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org";
  const text = whatsappText(data, appUrl);
  return NextResponse.json({ alert: data, push, whatsapp: { text, link: whatsappLink(text) } });
}
