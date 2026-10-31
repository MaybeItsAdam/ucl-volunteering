import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { getCurrentMember } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { PushPreferences } from "@/lib/types";

// Device tokens are opaque strings of hex, base64url and the odd colon or dash.
const TOKEN = /^[A-Za-z0-9:_\-.=]{20,4096}$/;

const PREFERENCE_COLUMNS = "food_alerts,task_reminders";

const fields = (body: unknown) => (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

function parse(body: unknown): { token: string; platform: "ios" | "android" } | null {
  const b = fields(body);
  if (typeof b.token !== "string" || !TOKEN.test(b.token)) return null;
  if (b.platform !== "ios" && b.platform !== "android") return null;
  return { token: b.token, platform: b.platform };
}

const failed = (what: string, message: string) => {
  console.error(`[push] couldn't ${what}: ${message}`);
  return NextResponse.json({ error: "Something went wrong, try again in a minute" }, { status: 500 });
};

/**
 * POST /api/push/devices { token, platform } — the phone app, after the person
 * tapped "Notify me" and allowed notifications. No sign-in needed (the Zero Food
 * Waste page is open to anyone); the member is noted when there is one.
 * Repeating it, as the app does on launch, just refreshes the row and leaves
 * the phone's preferences as they were. Answers with those preferences.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Notifications aren't set up yet" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;
  const device = parse(body);
  if (!device) return NextResponse.json({ error: "That doesn't look like a device token" }, { status: 400 });

  // Push services rotate a phone's token now and then; the app sends the one
  // it had before, so the phone keeps its preferences under the new one.
  const db = getSupabaseAdmin();
  const previous = fields(body).previous;
  let carried: PushPreferences | null = null;
  if (typeof previous === "string" && TOKEN.test(previous) && previous !== device.token) {
    const { data: old } = await db.from("push_devices").delete().eq("token", previous).select(PREFERENCE_COLUMNS).maybeSingle();
    carried = (old as PushPreferences | null) ?? null;
  }

  const member = await getCurrentMember();
  const { data, error: dbError } = await db
    .from("push_devices")
    .upsert(
      { ...device, ...carried, member_id: member?.id ?? null, last_seen_at: new Date().toISOString() },
      { onConflict: "token" },
    )
    .select(PREFERENCE_COLUMNS)
    .single();
  if (dbError) return failed("save a device", dbError.message);
  return NextResponse.json({ ok: true, preferences: data as PushPreferences });
}

/**
 * PATCH /api/push/devices { token, food_alerts?, task_reminders? } — switch one
 * kind of notification on or off for this phone. Knowing the token is the
 * proof, as it is for turning the phone off.
 */
export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Notifications aren't set up yet" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;
  const b = fields(body);
  if (typeof b.token !== "string" || !TOKEN.test(b.token)) return NextResponse.json({ error: "Unrecognised token" }, { status: 400 });
  const changes: Partial<PushPreferences> = {};
  for (const key of ["food_alerts", "task_reminders"] as const) {
    if (typeof b[key] === "boolean") changes[key] = b[key];
  }
  if (!Object.keys(changes).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error: dbError } = await getSupabaseAdmin()
    .from("push_devices")
    .update(changes)
    .eq("token", b.token)
    .select(PREFERENCE_COLUMNS)
    .maybeSingle();
  if (dbError) return failed("update a device", dbError.message);
  if (!data) return NextResponse.json({ error: "This phone isn't signed up for notifications" }, { status: 404 });
  return NextResponse.json({ ok: true, preferences: data as PushPreferences });
}

/**
 * DELETE /api/push/devices { token } — "Turn off": the phone stops being notified.
 * DELETE /api/push/devices { all: true } — signed in: every phone notified for
 * this member stops, from Settings on the web as well as in the app.
 */
export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });
  const { body, error } = await readJson(request);
  if (error) return error;
  const b = fields(body);
  const db = getSupabaseAdmin().from("push_devices");

  if (b.all === true) {
    const member = await getCurrentMember();
    if (!member) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    const { error: dbError } = await db.delete().eq("member_id", member.id);
    if (dbError) return failed("remove a member's devices", dbError.message);
    return NextResponse.json({ ok: true });
  }

  if (typeof b.token !== "string" || !TOKEN.test(b.token)) return NextResponse.json({ error: "Unrecognised token" }, { status: 400 });
  await db.delete().eq("token", b.token);
  return NextResponse.json({ ok: true });
}
