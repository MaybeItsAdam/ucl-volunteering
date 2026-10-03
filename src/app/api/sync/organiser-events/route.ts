import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { cronBearerMatches, cronOrCommittee } from "@/lib/cronAuth";
import { getCurrentMember } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { runOrganiserSync } from "@/lib/toolboxEvents";
import { can, profileOf } from "@/lib/access";

/**
 * Pull the UCL Student Social Impact calendar from its Toolbox iCal feed into
 * the plan (see lib/toolboxEvents). Every run is recorded in `sync_runs`.
 *
 * GET is Vercel Cron's (`Authorization: Bearer $CRON_SECRET`); a committee
 * member signed in may GET it too. POST is the "Sync now" button.
 */

async function run(actorId: string | null) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const result = await runOrganiserSync();
  if (actorId) {
    await audit(actorId, "sync.organiser_events", "sync_run", result.runId ?? "unrecorded", result.ok ? { ...result.summary } : { error: result.error });
  }
  if (!result.ok) return NextResponse.json({ ok: false, runId: result.runId, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, runId: result.runId, ...result.summary });
}

export async function GET(request: Request) {
  if (!(await cronOrCommittee(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const viaCron = cronBearerMatches(request.headers.get("authorization"));
  return run(viaCron ? null : ((await getCurrentMember())?.id ?? null));
}

export async function POST() {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!can(profileOf(member), "trigger_sync")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return run(member.id);
}
