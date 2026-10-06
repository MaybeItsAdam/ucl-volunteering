import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { cronBearerMatches, cronOrCommittee } from "@/lib/cronAuth";
import { getCurrentMember } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { runOrganiserSync } from "@/lib/toolboxEvents";
import { runCommunitySync } from "@/lib/communityEvents";
import { can, profileOf } from "@/lib/access";

/**
 * Pull the UCL Student Social Impact calendar from its Toolbox iCal feed into
 * the plan (see lib/toolboxEvents), then refresh What's on from the social
 * impact societies' feeds (lib/communityEvents). Every run is recorded in
 * `sync_runs`. What's on rides on this cron rather than a third, to stay
 * within the Hobby plan's cron allowance.
 *
 * GET is Vercel Cron's (`Authorization: Bearer $CRON_SECRET`); a committee
 * member signed in may GET it too. POST is the "Sync now" button.
 *
 * The response reflects the plan's sync; What's on's result rides along as
 * `community` and never fails the request, so a flaky society feed doesn't
 * make "Sync now" look broken.
 */

export const maxDuration = 300;

async function run(actorId: string | null) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const result = await runOrganiserSync();
  const community = await runCommunitySync();
  if (actorId) {
    await audit(actorId, "sync.organiser_events", "sync_run", result.runId ?? "unrecorded", result.ok ? { ...result.summary } : { error: result.error });
    await audit(actorId, "sync.community_events", "sync_run", community.runId ?? "unrecorded", community.ok ? { ...community.summary } : { error: community.error });
  }
  const communityBody = community.ok
    ? { ok: true, ...community.summary }
    : { ok: false, error: community.error, ...community.summary };
  if (!result.ok) {
    return NextResponse.json({ ok: false, runId: result.runId, error: result.error, community: communityBody }, { status: 502 });
  }
  return NextResponse.json({ ok: true, runId: result.runId, ...result.summary, community: communityBody });
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
