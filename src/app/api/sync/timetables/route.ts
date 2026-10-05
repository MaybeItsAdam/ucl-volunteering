import { NextResponse } from "next/server";
import { cronBearerMatches } from "@/lib/cronAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { listDueTimetables, refreshTimetable, type RefreshOutcome } from "@/lib/timetable";
import { isTimetableFeedKeyConfigured } from "@/lib/timetableCrypto";

/**
 * Vercel Cron: refresh every linked UCL timetable not fetched in the last
 * 20 hours, a few at a time, stopping before the function's time runs out.
 * Whatever is left goes first tomorrow (oldest first).
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
  const due = await listDueTimetables(new Date(), STALE_MS, BATCH);
  const counts: Record<RefreshOutcome, number> = { updated: 0, unchanged: 0, error: 0 };
  let next = 0;
  async function worker() {
    while (next < due.length && Date.now() - started < BUDGET_MS) {
      const memberId = due[next++];
      counts[await refreshTimetable(memberId)] += 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return NextResponse.json({ ok: true, due: due.length, ...counts, left: due.length - next });
}
