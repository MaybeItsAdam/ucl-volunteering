import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { londonDayKey } from "@/lib/planTime";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { parseVolunteer } from "@/lib/volunteers";

/**
 * Your own sign-up from /volunteer. Any UCL sign-in will do, committee or not;
 * the row is keyed on who's signed in, with their name and email from UCL, so
 * nobody can sign anyone else up. Signing up again replaces the answers.
 */
export async function POST(request: Request) {
  const auth = await requireApiCapability();
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Sign-ups aren't open yet" }, { status: 503 });
  const { body, error } = await readJson(request);
  if (error) return error;

  const parsed = parseVolunteer(body, londonDayKey(new Date()));
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { member } = auth;
  const { error: dbError } = await getSupabaseAdmin()
    .from("volunteers")
    .upsert({ ...parsed.value, member_id: member.id, name: member.name, email: member.email ?? "" }, { onConflict: "member_id" });
  if (dbError) {
    console.error(`[volunteers] couldn't save a sign-up: ${dbError.message}`);
    return NextResponse.json({ error: "Something went wrong, try again in a minute" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Take yourself off the register. */
export async function DELETE() {
  const auth = await requireApiCapability();
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

  const { error } = await getSupabaseAdmin().from("volunteers").delete().eq("member_id", auth.member.id);
  if (error) {
    console.error(`[volunteers] couldn't remove a sign-up: ${error.message}`);
    return NextResponse.json({ error: "Something went wrong, try again in a minute" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
