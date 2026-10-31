import { NextResponse } from "next/server";
import { exportAccount } from "@/lib/account";
import { londonDayKey } from "@/lib/planTime";
import { getCurrentMember } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";

/** GET /api/account/export — everything held about the signed-in member, as a JSON download. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "There's no data store set up" }, { status: 503 });
  try {
    const data = await exportAccount(member);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="volsoc-my-data-${londonDayKey(new Date())}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[account] export failed", error);
    return NextResponse.json({ error: "Your data couldn't be gathered, try again in a minute" }, { status: 500 });
  }
}
