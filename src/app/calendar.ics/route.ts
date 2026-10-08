import { listCommunityEvents } from "@/lib/communityEvents";
import { buildPublicCalendar, PUBLIC_REVALIDATE } from "@/lib/publicCalendar";
import { isSupabaseConfigured } from "@/lib/supabase";

// Read per request, cached at the edge for PUBLIC_REVALIDATE (below).
export const dynamic = "force-dynamic";

/** The public calendar as one feed to subscribe to (see lib/publicCalendar). */
export async function GET() {
  let body: string;
  try {
    const { societies, events } = isSupabaseConfigured() ? await listCommunityEvents() : { societies: [], events: [] };
    body = buildPublicCalendar(societies, events);
  } catch (error) {
    console.error(`[calendar.ics] couldn't load events: ${error instanceof Error ? error.message : error}`);
    // A calendar app keeps what it had on an error, rather than emptying.
    return new Response("Calendar unavailable, try again later", { status: 503 });
  }
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="volunteering-at-ucl.ics"',
      "Cache-Control": `public, max-age=0, s-maxage=${PUBLIC_REVALIDATE}, stale-while-revalidate=${PUBLIC_REVALIDATE}`,
    },
  });
}
