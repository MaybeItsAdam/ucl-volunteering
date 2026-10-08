import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireApiCapability } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/** Takes someone off the register, when they ask to be. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await getSupabaseAdmin().from("volunteers").delete().eq("id", id).select("id");
  if (error) {
    console.error(`[volunteers] couldn't delete ${id}: ${error.message}`);
    return NextResponse.json({ error: "Couldn't remove them, try again" }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit(auth.member.id, "volunteer.delete", "volunteer", id);
  return NextResponse.json({ ok: true });
}
