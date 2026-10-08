import { escapeText, foldLine } from "@/lib/calendarFeed";
import type { CommunityEvent, CommunitySociety } from "@/lib/communityEvents";
import { londonDayKey } from "@/lib/planTime";

/**
 * The public calendar (/calendar and /calendar.ics): What's on's events, open
 * to anyone. The societies are What's on's (the SU's `altruism` societies,
 * VolSoc and Student Social Impact, see lib/communityEvents), synced daily.
 * This file only writes them out as one feed to subscribe to.
 */

export const PUBLIC_CALENDAR_NAME = "Volunteering at UCL";
/** How long a page or feed is reused, in seconds; the sync itself is daily. */
export const PUBLIC_REVALIDATE = 1800;

const utcStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// All-day events start at London midnight, which is 23:00Z the day before in summer.
const dayStamp = (iso: string) => londonDayKey(new Date(iso)).replace(/-/g, "");

/** Every society's events as one subscribable feed; each event says whose it is. */
export function buildPublicCalendar(
  societies: readonly CommunitySociety[],
  events: readonly CommunityEvent[],
  now = new Date(),
): string {
  const names = new Map(societies.map((s) => [s.id, s.name]));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UCL Volunteering Society//Public calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${PUBLIC_CALENDAR_NAME}`,
    "X-WR-TIMEZONE:Europe/London",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  const stamp = utcStamp(now.toISOString());
  for (const event of events) {
    const host = names.get(event.societyId);
    const description = [host ? `Run by ${host}` : null, event.url].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.id)}@uclvolunteering.org`,
      `DTSTAMP:${stamp}`,
      ...(event.allDay
        ? [`DTSTART;VALUE=DATE:${dayStamp(event.startsAt)}`, `DTEND;VALUE=DATE:${dayStamp(event.endsAt)}`]
        : [`DTSTART:${utcStamp(event.startsAt)}`, `DTEND:${utcStamp(event.endsAt)}`]),
      `SUMMARY:${escapeText(event.title)}`,
      `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${event.url}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
