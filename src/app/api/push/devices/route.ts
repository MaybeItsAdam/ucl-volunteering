import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { getCurrentMember } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Device tokens are opaque strings of hex, base64url and the odd colon or dash.
const TOKEN = /^[A-Za-z0-9:_\-.=]{20,4096}$/;

function parse(body: unknown): { token: string; platform: "ios" | "android" } | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.token !== "string" || !TOKEN.test(b.token)) return null;
  if (b.platform !== "ios" && b.platform !== "android") return null;
  return { token: b.token, platform: b.platform };
}

/**
 * POST /api/push/devices { token, platform } — the phone app, after the person
 * tapped "Notify me" and allowed notifications. No sign-in needed (the Zero Food
 * Waste page is open to anyone); the member is noted when there is one.
 * Repeating it, as the app does on launch, just refreshes the row.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Notifications aren't set up yet" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;
  const device = parse(body);
  if (!device) return NextResponse.json({ error: "That doesn't look like a device token" }, { status: 400 });

  const member = await getCurrentMember();
  const { error: dbError } = await getSupabaseAdmin()
    .from("push_devices")
    .upsert({ ...device, member_id: member?.id ?? null, last_seen_at: new Date().toISOString() }, { onConflict: "token" });
  if (dbError) {
    console.error(`[push] couldn't save a device: ${dbError.message}`);
    return NextResponse.json({ error: "Something went wrong, try again in a minute" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/push/devices { token } — "Turn off": the phone stops being notified. */
export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });
  const { body, error } = await readJson(request);
  if (error) return error;
  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || !TOKEN.test(token)) return NextResponse.json({ error: "Unrecognised token" }, { status: 400 });
  await getSupabaseAdmin().from("push_devices").delete().eq("token", token);
  return NextResponse.json({ ok: true });
}
