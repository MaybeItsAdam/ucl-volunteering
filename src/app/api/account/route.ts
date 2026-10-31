import { NextResponse } from "next/server";
import { AccountError, deleteAccount } from "@/lib/account";
import { clearSessionCookie, getCurrentMember } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";

/** DELETE /api/account — remove the signed-in member and everything they hold, then sign them out. */
export async function DELETE() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "There's no data store set up" }, { status: 503 });
  try {
    await deleteAccount(member);
  } catch (error) {
    if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[account] delete failed", error);
    return NextResponse.json({ error: "Your account couldn't be deleted, try again in a minute" }, { status: 500 });
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
