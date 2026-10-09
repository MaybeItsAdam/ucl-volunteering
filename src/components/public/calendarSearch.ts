/** The public calendar's search. Pure. */

/** Lower case with the accents off, so "cafe" finds "Café". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

interface Searchable {
  title: string;
  location: string | null;
  description: string | null;
}

/**
 * Whether an event matches every word of the query, in its title, host,
 * place or description. An empty query matches everything.
 */
export function matchesQuery(event: Searchable, host: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold([event.title, host, event.location ?? "", event.description ?? ""].join(" "));
  return words.every((w) => haystack.includes(w));
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (key: string) => key.replace(/-/g, "");

/** One event as an .ics file, for "Download" on calendars that aren't Google. */
export function eventIcs(
  event: Searchable & { id: string; startsAt: string; endsAt: string; allDay: boolean; url: string; cancelled: boolean },
  host: string,
  days: { first: string; afterLast: string },
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UCL Volunteering Society//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@uclvolunteering.org`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    ...(event.allDay
      ? [`DTSTART;VALUE=DATE:${icsDate(days.first)}`, `DTEND;VALUE=DATE:${icsDate(days.afterLast)}`]
      : [`DTSTART:${icsStamp(event.startsAt)}`, `DTEND:${icsStamp(event.endsAt)}`]),
    `SUMMARY:${icsText(event.title)}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    `DESCRIPTION:${icsText(`Run by ${host}${event.description ? `\n\n${event.description}` : ""}\n\n${event.url}`)}`,
    `URL:${event.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
