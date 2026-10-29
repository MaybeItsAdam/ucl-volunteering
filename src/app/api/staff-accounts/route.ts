import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { audit } from "@/lib/audit";
import { displayAccessCode, generateAccessCode, hashAccessCode } from "@/lib/accessCodes";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/**
 * POST /api/staff-accounts { name } — a principal gives a CH&Co person an
 * access code. The code is in this answer and nowhere else: only its hash is
 * kept, so a lost one means revoking the person and making a new one.
 */
export async function POST(request: Request) {
  const auth = await requireApiCapability("manage_members");
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;

  const raw = (body as { name?: unknown } | null)?.name;
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Add their name" }, { status: 400 });

  const code = generateAccessCode();
  const { data, error: dbError } = await getSupabaseAdmin()
    .from("partner_staff")
    .insert({ name, code_hash: hashAccessCode(code), created_by: auth.member.id })
    .select("id,name,organisation,created_at,last_seen_at,revoked_at")
    .single();
  if (dbError) {
    console.error(`[staff-accounts] couldn't create: ${dbError.message}`);
    return NextResponse.json({ error: "Couldn't make that code, try again" }, { status: 500 });
  }
  await audit(auth.member.id, "staff.create", "partner_staff", data.id, { name });
  return NextResponse.json({ staff: data, code: displayAccessCode(code) });
}
