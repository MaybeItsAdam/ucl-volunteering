import { timingSafeEqual } from "node:crypto";
import type { PlanEvent } from "@/lib/types";

/**
 * VolSoc's own events as an iCal feed the committee subscribes to from Google,
 * Apple or Outlook Calendar. The plan holds provisional, committee-only events,
 * so the feed is behind `CALENDAR_FEED_TOKEN` in its path: anyone with the
 * link can read it, and changing the token cuts every old link off.
 *
 * Only VolSoc's events go in (typed into the app, or from VolSoc's Toolbox
 * page); Social Impact has its own public feed on the Toolbox.
 */

export const FEED_PAST_DAYS = 90;
export const FEED_FUTURE_DAYS = 400;
export const FEED_NAME = "VolSoc";

/** The token in a feed URL is the one configured. False when none is. */
export function feedTokenMatches(token: string, expected = process.env.CALENDAR_FEED_TOKEN): boolean {
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Where a feed lives, or null with no token configured. */
export function volsocFeedUrl(appUrl: string, token = process.env.CALENDAR_FEED_TOKEN): string | null {
  if (!token) return null;
  return `${appUrl.replace(/\/+$/, "")}/api/calendar/volsoc/${encodeURIComponent(token)}`;
}

/** RFC 5545 TEXT: backslash, semicolon, comma and newline escaped. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines over 75 octets continue on the next, indented by a space. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (size + width > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const utcStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateStamp = (iso: string) => utcStamp(iso).slice(0, 8);

const STATUS: Record<PlanEvent["status"], string> = {
  provisional: "TENTATIVE",
  confirmed: "CONFIRMED",
  cancelled: "CANCELLED",
};

/** The feed's body. `eventUrl` turns an event into its page in the app. */
export function buildCalendar(events: readonly PlanEvent[], eventUrl: (id: string) => string, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UCL Volunteering Society//Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${FEED_NAME}`,
    "X-WR-TIMEZONE:Europe/London",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  const stamp = utcStamp(now.toISOString());
  for (const event of events) {
    const url = eventUrl(event.id);
    const description = [event.description?.trim(), url].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@uclvolunteering.org`,
      `DTSTAMP:${stamp}`,
      ...(event.allDay
        ? [`DTSTART;VALUE=DATE:${dateStamp(event.startsAt)}`, `DTEND;VALUE=DATE:${dateStamp(event.endsAt)}`]
        : [`DTSTART:${utcStamp(event.startsAt)}`, `DTEND:${utcStamp(event.endsAt)}`]),
      `SUMMARY:${escapeText(event.title)}`,
      `STATUS:${STATUS[event.status]}`,
      ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${url}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
