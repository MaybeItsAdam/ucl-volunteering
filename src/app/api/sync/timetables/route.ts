import { NextResponse } from "next/server";
import { listDueLinks, refreshCalendarLink, type RefreshOutcome } from "@/lib/calendarLinks";
import { cronBearerMatches } from "@/lib/cronAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isTimetableFeedKeyConfigured } from "@/lib/timetableCrypto";

/**
 * Vercel Cron: refresh every linked calendar (UCL timetables and personal
 * calendars alike, each on its own) not fetched in the last 20 hours, a few
 * at a time, stopping before the function's time runs out. Whatever is left
 * goes first tomorrow (oldest first). The path predates personal calendars.
 */

export const maxDuration = 300;

const STALE_MS = 20 * 3_600_000;
const BATCH = 200;
const CONCURRENCY = 4;
const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  if (!cronBearerMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured() || !isTimetableFeedKeyConfigured()) {
    return NextResponse.json({ ok: true, skipped: "not configured" });
  }

  const started = Date.now();
  const due = await listDueLinks(new Date(), STALE_MS, BATCH);
  const counts: Record<RefreshOutcome, number> = { updated: 0, unchanged: 0, error: 0 };
  let next = 0;
  async function worker() {
    while (next < due.length && Date.now() - started < BUDGET_MS) {
      const link = due[next++];
      counts[await refreshCalendarLink(link)] += 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return NextResponse.json({ ok: true, due: due.length, ...counts, left: due.length - next });
}
