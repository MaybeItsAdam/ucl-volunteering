import { NextResponse } from "next/server";
import { cronBearerMatches } from "@/lib/cronAuth";
import { isoWeekday, londonDayKey } from "@/lib/planTime";
import { pushToMember } from "@/lib/push";
import { planNudges } from "@/lib/reminders";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const maxDuration = 120;

/**
 * Vercel Cron, mornings: tell each committee member, in one notification, what
 * of theirs is overdue or due today or tomorrow (and on Mondays, how their
 * week looks). Reaches phones that switched alerts on while signed in.
 */
export async function GET(request: Request) {
  if (!cronBearerMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, skipped: "not configured" });

  const { data, error } = await getSupabaseAdmin().from("tasks").select("title,assignee_member_id,due_on").is("completed_at", null);
  if (error) {
    console.error(`[reminders] couldn't read the tasks: ${error.message}`);
    return NextResponse.json({ error: "Couldn't read the tasks" }, { status: 500 });
  }
  const today = londonDayKey(new Date());
  const nudges = planNudges(
    (data ?? []).map((t) => ({ title: t.title as string, assigneeId: t.assignee_member_id as string, dueOn: t.due_on as string | null })),
    today,
    isoWeekday(today) === 1,
  );

  let sent = 0;
  for (const [memberId, nudge] of nudges) {
    const result = await pushToMember(memberId, { ...nudge, url: "/portal/my-tasks" }).catch(() => null);
    sent += result?.sent ?? 0;
  }
  return NextResponse.json({ ok: true, members: nudges.size, sent });
}
