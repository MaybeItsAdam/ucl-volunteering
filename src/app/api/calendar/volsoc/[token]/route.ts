import { NextResponse } from "next/server";
import { buildCalendar, FEED_FUTURE_DAYS, FEED_PAST_DAYS, feedTokenMatches } from "@/lib/calendarFeed";
import { listEvents } from "@/lib/plan";
import { isSupabaseConfigured } from "@/lib/supabase";

const DAY_MS = 86_400_000;

/**
 * VolSoc's events as a subscribable calendar (see lib/calendarFeed). The
 * token is the only key: calendar apps can't sign in. A wrong one is a 404,
 * so the URL shape gives nothing away.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!feedTokenMatches(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const now = new Date();
  const events = (
    await listEvents(new Date(now.getTime() - FEED_PAST_DAYS * DAY_MS), new Date(now.getTime() + FEED_FUTURE_DAYS * DAY_MS))
  ).filter((e) => e.source === "volsoc" || e.source === "volsoc_toolbox");

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const body = buildCalendar(events, (id) => `${origin.replace(/\/+$/, "")}/portal/calendar/events/${id}`, now);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="volsoc.ics"',
      // Private to whoever holds the link: never in a shared cache.
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
