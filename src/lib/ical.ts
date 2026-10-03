import { LONDON, londonDayKey, shiftDayKey, startOfLondonDay, wallTimeToDate } from "@/lib/planTime";

/**
 * Enough of RFC 5545 for the Toolbox organiser feed and ordinary exports:
 * folded lines, escaped text, UTC / TZID / floating / all-day dates.
 *
 * Recurrence rules are not expanded; Toolbox writes one VEVENT per occurrence.
 * A VEVENT with no UID or no parseable DTSTART is dropped rather than guessed
 * at, since the UID is what a later sync matches on.
 */

export interface IcalEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  start: Date;
  /** DTEND, or DTSTART + DURATION; null if the event gave neither. */
  end: Date | null;
  /** DTSTART was a `VALUE=DATE` (or bare date): midnight-to-midnight London days. */
  allDay: boolean;
  cancelled: boolean;
}

export interface IcalDate {
  date: Date;
  allDay: boolean;
}

/** Undo RFC 5545 line folding: a CRLF (or bare LF) followed by one space or tab. */
export function unfoldLines(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/);
}

/** `\\`, `\;`, `\,`, `\n`/`\N` → their characters. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

interface ContentLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** `NAME;P1=a;P2="b:c":value` — a colon inside a quoted parameter is not the separator. */
export function parseContentLine(line: string): ContentLine | null {
  let i = 0;
  let quoted = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...rawParams] = head.split(";");
  const params: Record<string, string> = {};
  for (const raw of rawParams) {
    const eq = raw.indexOf("=");
    if (eq === -1) continue;
    params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * A DATE or DATE-TIME value. `Z` is UTC; otherwise the time is wall time in
 * `TZID` (or `defaultZone` when floating). A bare date is London midnight.
 * An unknown TZID falls back to `defaultZone` rather than dropping the event.
 */
export function parseIcalDate(value: string, params: Record<string, string> = {}, defaultZone: string = LONDON): IcalDate | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, utc] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const allDay = h === undefined || params.VALUE?.toUpperCase() === "DATE";
  if (allDay) return { date: wallTimeToDate({ year, month, day }, LONDON), allDay: true };

  const wall = { year, month, day, hour: Number(h), minute: Number(mi), second: Number(s ?? 0) };
  if (utc) {
    return { date: new Date(Date.UTC(year, month - 1, day, wall.hour, wall.minute, wall.second)), allDay: false };
  }
  let zone = params.TZID || defaultZone;
  try {
    return { date: wallTimeToDate(wall, zone), allDay: false };
  } catch {
    zone = defaultZone;
    return { date: wallTimeToDate(wall, zone), allDay: false };
  }
}

/** `PT1H30M`, `P1D`, `-PT15M` → milliseconds; null if malformed. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m || value.trim() === "P" || /T$/.test(value.trim())) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 86_400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

function text(value: string): string | null {
  const t = unescapeText(value).trim();
  return t ? t : null;
}

/** Every VEVENT in a calendar, cancelled ones included (`cancelled: true`). */
export function parseIcal(source: string, defaultZone: string = LONDON): IcalEvent[] {
  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> & { duration?: number } | null = null;
  // VALARM and friends nest inside a VEVENT; their properties aren't the event's.
  let nested = 0;

  for (const line of unfoldLines(source)) {
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = {};
      nested = 0;
      continue;
    }
    if (upper === "END:VEVENT") {
      if (current?.uid && current.start) {
        let end = current.end ?? null;
        if (!end && current.duration !== undefined) end = new Date(current.start.getTime() + current.duration);
        // An all-day event with no end is one day long (RFC 5545 §3.6.1).
        if (!end && current.allDay) end = startOfLondonDay(shiftDayKey(londonDayKey(current.start), 1));
        events.push({
          uid: current.uid,
          title: current.title ?? "",
          description: current.description ?? null,
          location: current.location ?? null,
          url: current.url ?? null,
          start: current.start,
          end: end && end.getTime() >= current.start.getTime() ? end : null,
          allDay: current.allDay ?? false,
          cancelled: current.cancelled ?? false,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    if (upper.startsWith("BEGIN:")) {
      nested += 1;
      continue;
    }
    if (upper.startsWith("END:")) {
      nested = Math.max(0, nested - 1);
      continue;
    }
    if (nested) continue;

    const prop = parseContentLine(line);
    if (!prop) continue;
    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim();
        break;
      case "SUMMARY":
        current.title = text(prop.value) ?? "";
        break;
      case "DESCRIPTION":
        current.description = text(prop.value);
        break;
      case "LOCATION":
        current.location = text(prop.value);
        break;
      case "URL":
        current.url = prop.value.trim() || null;
        break;
      case "DTSTART": {
        const parsed = parseIcalDate(prop.value, prop.params, defaultZone);
        if (parsed) {
          current.start = parsed.date;
          current.allDay = parsed.allDay;
        }
        break;
      }
      case "DTEND": {
        const parsed = parseIcalDate(prop.value, prop.params, defaultZone);
        if (parsed) current.end = parsed.date;
        break;
      }
      case "DURATION": {
        const ms = parseDuration(prop.value);
        if (ms !== null) current.duration = ms;
        break;
      }
      case "STATUS":
        current.cancelled = prop.value.trim().toUpperCase() === "CANCELLED";
        break;
    }
  }

  return events;
}
