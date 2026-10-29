import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { hashAccessCode, normaliseAccessCode } from "@/lib/accessCodes";
import { isSessionSecretConfigured } from "@/lib/session";
import { setStaffCookie } from "@/lib/staff";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/** Swap a CH&Co access code for the staff session cookie. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !isSessionSecretConfigured()) {
    return NextResponse.json({ error: "Staff sign-in isn't set up yet" }, { status: 503 });
  }
  const { body, error } = await readJson(request);
  if (error) return error;

  const code = normaliseAccessCode((body as { code?: unknown } | null)?.code);
  const { data } = code
    ? await getSupabaseAdmin()
        .from("partner_staff")
        .select("id")
        .eq("code_hash", hashAccessCode(code))
        .is("revoked_at", null)
        .maybeSingle<{ id: string }>()
    : { data: null };
  if (!data) {
    // A pause on every wrong guess; the codes are long enough that guessing is hopeless anyway.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: "That code isn't right, or it's been switched off" }, { status: 401 });
  }

  await getSupabaseAdmin().from("partner_staff").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  await setStaffCookie(data.id);
  return NextResponse.json({ ok: true });
}
