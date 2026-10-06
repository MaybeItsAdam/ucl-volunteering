/**
 * An iCalendar **reader**.
 *
 * `src/lib/ical.ts` is the writer — it turns our events into the feeds
 * societies subscribe to. This is the other direction, and the two do not
 * share code on purpose: the writer emits one dialect we control, while a
 * reader has to survive whatever Exchange, Google and a decade of hand-rolled
 * exporters actually send.
 *
 * Deliberately not a general RFC 5545 implementation. It covers what the
 * feeds we ingest contain, and says so loudly when it meets something else:
 *
 *   - `VEVENT` only. `VTODO`, `VJOURNAL`, `VFREEBUSY` and `VALARM` are skipped.
 *   - `FREQ=DAILY` and `FREQ=WEEKLY` recurrence, with `INTERVAL`, `BYDAY`,
 *     `COUNT` and `UNTIL`. `MONTHLY` and `YEARLY` yield the master event only
 *     and are reported in `unsupported` rather than silently dropped — see
 *     `ExpandOptions.horizon` for why guessing would be worse.
 *   - Windows time-zone names ("GMT Standard Time"), because Exchange
 *     publishes those rather than IANA ids and `Intl` does not know them.
 *
 * No dependency: `node-ical` and `ical.js` both pull a parser far larger than
 * the subset above, and `rrule` is 70 kB to expand twenty-seven weekly rules.
 */

/** A single property line, after unfolding. */
type IcsProperty = {
  name: string;
  params: Record<string, string>;
  value: string;
};

/** A wall-clock instant with no zone attached yet. */
export type WallTime = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
  /** A `VALUE=DATE` property: midnight-to-midnight, no time of day was given. */
  dateOnly: boolean;
  /** Set when the value carried a trailing `Z`. Overrides any `TZID`. */
  utc: boolean;
  /** The raw `TZID` parameter, un-translated. */
  tzid: string | null;
};

export type IcsEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  /** UTC instant the occurrence starts. */
  start: Date;
  /** UTC instant it ends. Falls back to `start` when the feed gave no end. */
  end: Date;
  /** True for a `VALUE=DATE` event — an all-day or multi-day listing. */
  allDay: boolean;
  status: string | null;
  /**
   * The `RECURRENCE-ID` of this occurrence, as `YYYYMMDDTHHMMSS`, or null for
   * a non-recurring event and for the master of a series.
   *
   * Kept so a caller can build a stable per-occurrence key: a recurring
   * event's `UID` is the same on every instance, so `UID` alone would collapse
   * a weekly club night into one row.
   */
  recurrenceId: string | null;
  /** Whether this occurrence came out of an `RRULE` expansion. */
  recurring: boolean;
  /**
   * False when the event says it doesn't block time: `TRANSP:TRANSPARENT`
   * ("show as free" in Google and Apple), or Exchange's
   * `X-MICROSOFT-CDO-BUSYSTATUS:FREE`, which Outlook's published feeds use.
   */
  busy: boolean;
};

export type IcsCalendar = {
  /** `X-WR-CALNAME`, when the publisher set one. */
  name: string | null;
  events: IcsEvent[];
  /**
   * Things met and not handled, one line each, for the caller to log.
   *
   * A feed that silently loses a third of its events is the failure mode worth
   * engineering against here: the sync reports this count, so a publisher
   * switching to monthly recurrence shows up as a number rather than as
   * events quietly going missing.
   */
  unsupported: string[];
};

export type ExpandOptions = {
  /**
   * How far ahead to expand an open-ended `RRULE`.
   *
   * A rule with neither `COUNT` nor `UNTIL` repeats forever, so something has
   * to stop. A horizon is the honest limit — it is re-expanded on the next
   * sync, so the window keeps moving rather than the feed being truncated once.
   */
  horizon: Date;
  /** Occurrences before this are dropped. Defaults to no lower bound. */
  since?: Date;
  /** Hard ceiling per series, so a malformed `INTERVAL=0` cannot hang a sync. */
  maxOccurrences?: number;
};

const DEFAULT_MAX_OCCURRENCES = 750;

/**
 * Windows time-zone names to IANA ids.
 *
 * Exchange publishes `TZID:GMT Standard Time`, which `Intl` rejects. Only the
 * zones our feeds actually use are listed; an unknown name falls back to
 * Europe/London and is reported, because every calendar we read is a London
 * one and failing the whole event would be a worse answer than an hour's
 * error on the rare import from elsewhere.
 */
const WINDOWS_TIME_ZONES: Record<string, string> = {
  "gmt standard time": "Europe/London",
  "greenwich standard time": "Atlantic/Reykjavik",
  "w. europe standard time": "Europe/Berlin",
  "romance standard time": "Europe/Paris",
  "central europe standard time": "Europe/Budapest",
  "central european standard time": "Europe/Warsaw",
  "e. europe standard time": "Europe/Chisinau",
  "gtb standard time": "Europe/Bucharest",
  "utc": "UTC",
};

export const DEFAULT_TIME_ZONE = "Europe/London";

/** Translate a `TZID` value to an IANA id, or null if it is not one we know. */
export function resolveTimeZone(tzid: string | null): string | null {
  if (!tzid) return null;
  const mapped = WINDOWS_TIME_ZONES[tzid.trim().toLowerCase()];
  if (mapped) return mapped;
  // Already IANA? Ask Intl rather than pattern-matching the string.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid }).format(new Date());
    return tzid;
  } catch {
    return null;
  }
}

/**
 * Undo RFC 5545 line folding.
 *
 * A continuation is CRLF (or bare LF, which Exchange does emit) followed by
 * one space or tab; that single whitespace character is part of the folding,
 * not of the value, so it is dropped rather than kept.
 */
export function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((line) => line.length > 0);
}

/**
 * Split `NAME;PARAM=value:the value` into its three parts.
 *
 * The name/params boundary has to be found by scanning rather than by a
 * regex on `:`, because a quoted parameter value may legally contain one —
 * `TZID="GMT+1:00"` is rare but real.
 */
export function parseProperty(line: string): IcsProperty | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = splitOutsideQuotes(head, ";");
  const name = (segments.shift() ?? "").toUpperCase();
  if (!name) return null;

  const params: Record<string, string> = {};
  for (const segment of segments) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq).toUpperCase();
    let raw = segment.slice(eq + 1);
    if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
      raw = raw.slice(1, -1);
    }
    params[key] = raw;
  }
  return { name, params, value };
}

function splitOutsideQuotes(input: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of input) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

/** Reverse the TEXT escaping the writer applies: `\n`, `\,`, `\;`, `\\`. */
export function unescapeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[i + 1];
    i += 1;
    if (next === "n" || next === "N") out += "\n";
    else if (next === undefined) out += "\\";
    else out += next;
  }
  return out;
}

/** Parse `YYYYMMDD`, `YYYYMMDDTHHMMSS` or `YYYYMMDDTHHMMSSZ` into wall time. */
export function parseWallTime(
  value: string,
  params: Record<string, string>,
): WallTime | null {
  const trimmed = value.trim();
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(trimmed);
  if (!match) return null;
  const dateOnly = match[4] === undefined || params.VALUE === "DATE";
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: dateOnly ? 0 : Number(match[4]),
    minute: dateOnly ? 0 : Number(match[5]),
    second: dateOnly ? 0 : Number(match[6]),
    dateOnly,
    utc: match[7] === "Z",
    tzid: params.TZID ?? null,
  };
}

/**
 * The offset, in milliseconds, that `zone` was at on `instant`.
 *
 * Derived by formatting the instant in the zone and reading the fields back,
 * which is the only way to get an offset out of `Intl` without a table of our
 * own that would start rotting the day it was written.
 */
function zoneOffsetMs(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const field = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Turn a wall-clock reading in `zone` into the UTC instant it names.
 *
 * Two passes, because the offset depends on the answer: the first guess uses
 * the offset at the same clock reading interpreted as UTC, the second uses the
 * offset actually in force at that guess. That second pass is what gets the
 * two DST weekends right — a 20:00 event on the night the clocks go back would
 * otherwise land an hour out.
 */
export function wallTimeToUtc(wall: WallTime, fallbackZone: string): Date {
  if (wall.utc) {
    return new Date(
      Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
    );
  }
  const zone = resolveTimeZone(wall.tzid) ?? fallbackZone;
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  const firstGuess = naive - zoneOffsetMs(new Date(naive), zone);
  const settled = naive - zoneOffsetMs(new Date(firstGuess), zone);
  return new Date(settled);
}

/** Add whole days to a wall-clock reading, leaving the time of day alone. */
function addDays(wall: WallTime, days: number): WallTime {
  const shifted = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return {
    ...wall,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Day of the week for a wall-clock date, 0 = Sunday, matching `BYDAY` order. */
function weekday(wall: WallTime): number {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
}

const BYDAY_TO_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/** `YYYYMMDDTHHMMSS` — the key both `RECURRENCE-ID` and `EXDATE` are matched on. */
function occurrenceKey(wall: WallTime): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${pad(wall.year, 4)}${pad(wall.month)}${pad(wall.day)}` +
    `T${pad(wall.hour)}${pad(wall.minute)}${pad(wall.second)}`
  );
}

type Rrule = {
  freq: string;
  interval: number;
  count: number | null;
  until: WallTime | null;
  byDay: number[];
};

function parseRrule(value: string): Rrule | null {
  const parts = value.split(";");
  const map: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    map[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  if (!map.FREQ) return null;

  const interval = Number(map.INTERVAL ?? "1");
  const byDay = (map.BYDAY ?? "")
    .split(",")
    .map((token) => token.trim().toUpperCase())
    // Strip an ordinal prefix ("-1SU"). We do not implement positional BYDAY;
    // it only appears on the YEARLY rules inside VTIMEZONE, which we skip.
    .map((token) => BYDAY_TO_INDEX[token.replace(/^[+-]?\d+/, "")])
    .filter((index): index is number => index !== undefined);

  return {
    freq: map.FREQ.toUpperCase(),
    // A zero or negative INTERVAL would never terminate. Treat it as 1 rather
    // than rejecting the rule, which is what every calendar client does.
    interval: Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 1,
    count: map.COUNT ? Number(map.COUNT) : null,
    until: map.UNTIL ? parseWallTime(map.UNTIL, {}) : null,
    byDay,
  };
}

type RawEvent = {
  properties: IcsProperty[];
};

/** Group the unfolded lines into `VEVENT` blocks, ignoring every other component. */
function collectEvents(lines: string[]): { events: RawEvent[]; calendarName: string | null } {
  const events: RawEvent[] = [];
  let calendarName: string | null = null;
  let current: RawEvent | null = null;
  // VTIMEZONE also contains DTSTART and RRULE, so nesting has to be tracked
  // rather than assuming any BEGIN inside a VEVENT is impossible.
  let depth = 0;

  for (const line of lines) {
    const property = parseProperty(line);
    if (!property) continue;

    if (property.name === "BEGIN") {
      if (property.value.toUpperCase() === "VEVENT" && depth === 0) {
        current = { properties: [] };
      } else if (current) {
        depth += 1;
      }
      continue;
    }
    if (property.name === "END") {
      if (property.value.toUpperCase() === "VEVENT" && depth === 0) {
        if (current) events.push(current);
        current = null;
      } else if (current && depth > 0) {
        depth -= 1;
      }
      continue;
    }
    if (current && depth === 0) {
      current.properties.push(property);
      continue;
    }
    if (!current && property.name === "X-WR-CALNAME") {
      calendarName = unescapeText(property.value);
    }
  }
  return { events, calendarName };
}

function firstValue(properties: IcsProperty[], name: string): IcsProperty | undefined {
  return properties.find((property) => property.name === name);
}

/**
 * Read a feed and expand it into concrete occurrences.
 *
 * Ordering of the three recurrence mechanics matters and is the part worth
 * reading twice: `EXDATE` removes an occurrence, a `RECURRENCE-ID` component
 * *replaces* one, and a replacement wins even where an `EXDATE` also matched —
 * a meeting moved to a new room is not a meeting cancelled.
 */
function isBusy(properties: IcsProperty[]): boolean {
  if (firstValue(properties, "TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT") return false;
  return firstValue(properties, "X-MICROSOFT-CDO-BUSYSTATUS")?.value.trim().toUpperCase() !== "FREE";
}

export function parseIcs(raw: string, options: ExpandOptions): IcsCalendar {
  const unsupported: string[] = [];
  const { events: rawEvents, calendarName } = collectEvents(unfold(raw));
  const maxOccurrences = options.maxOccurrences ?? DEFAULT_MAX_OCCURRENCES;

  // Pass one: the overrides, keyed by UID + the instance they replace.
  const overrides = new Map<string, RawEvent>();
  for (const event of rawEvents) {
    const recurrenceId = firstValue(event.properties, "RECURRENCE-ID");
    const uid = firstValue(event.properties, "UID");
    if (!recurrenceId || !uid) continue;
    const wall = parseWallTime(recurrenceId.value, recurrenceId.params);
    if (!wall) continue;
    overrides.set(`${uid.value}::${occurrenceKey(wall)}`, event);
  }

  const out: IcsEvent[] = [];

  for (const event of rawEvents) {
    // Overrides are consumed by their master below, not emitted on their own —
    // otherwise a moved instance would appear twice, once at each time.
    if (firstValue(event.properties, "RECURRENCE-ID")) continue;

    const uidProperty = firstValue(event.properties, "UID");
    const dtStart = firstValue(event.properties, "DTSTART");
    if (!uidProperty || !dtStart) {
      unsupported.push("VEVENT without UID or DTSTART");
      continue;
    }
    const uid = uidProperty.value;
    const startWall = parseWallTime(dtStart.value, dtStart.params);
    if (!startWall) {
      unsupported.push(`${uid}: unparseable DTSTART "${dtStart.value}"`);
      continue;
    }

    const dtEnd = firstValue(event.properties, "DTEND");
    const endWall = dtEnd ? parseWallTime(dtEnd.value, dtEnd.params) : null;
    // The duration is held as a millisecond gap between the two *UTC*
    // readings, then re-applied to each occurrence's wall start. Doing it this
    // way means a 20:00–01:30 club night stays five and a half hours long on
    // the DST weekend instead of becoming four and a half.
    const durationMs = endWall
      ? Math.max(
          0,
          wallTimeToUtc(endWall, DEFAULT_TIME_ZONE).getTime() -
            wallTimeToUtc(startWall, DEFAULT_TIME_ZONE).getTime(),
        )
      : 0;

    const summary = unescapeText(firstValue(event.properties, "SUMMARY")?.value ?? "").trim();
    const description = firstValue(event.properties, "DESCRIPTION")?.value;
    const location = firstValue(event.properties, "LOCATION")?.value;
    const status = firstValue(event.properties, "STATUS")?.value ?? null;

    const excluded = new Set<string>();
    for (const property of event.properties) {
      if (property.name !== "EXDATE") continue;
      for (const token of property.value.split(",")) {
        const wall = parseWallTime(token, property.params);
        if (wall) excluded.add(occurrenceKey(wall));
      }
    }

    const rruleProperty = firstValue(event.properties, "RRULE");
    const rule = rruleProperty ? parseRrule(rruleProperty.value) : null;

    /**
     * Push one occurrence, if it falls inside the window.
     *
     * The window is tested here rather than at each call site because there
     * are two of them and only one used to do it: the recurrence loop bounded
     * itself with `since`/`horizon` while the single-event path emitted
     * whatever the feed held. On a published calendar that keeps its history
     * — this one reaches back to September 2025 — that was most of the feed,
     * so a "next 180 days" sync wrote 541 events of which the first hundreds
     * were a year old.
     */
    const emit = (wall: WallTime, recurring: boolean) => {
      const key = occurrenceKey(wall);
      const override = overrides.get(`${uid}::${key}`);
      const source = override ?? event;

      const overrideStart = override ? firstValue(override.properties, "DTSTART") : undefined;
      const overrideStartWall =
        overrideStart ? parseWallTime(overrideStart.value, overrideStart.params) : null;
      const effectiveStartWall = overrideStartWall ?? wall;

      const overrideEnd = override ? firstValue(override.properties, "DTEND") : undefined;
      const overrideEndWall =
        overrideEnd ? parseWallTime(overrideEnd.value, overrideEnd.params) : null;

      const start = wallTimeToUtc(effectiveStartWall, DEFAULT_TIME_ZONE);
      const end = overrideEndWall
        ? wallTimeToUtc(overrideEndWall, DEFAULT_TIME_ZONE)
        : new Date(start.getTime() + durationMs);

      if (start.getTime() > options.horizon.getTime()) return;
      if (options.since && start.getTime() < options.since.getTime()) return;

      out.push({
        uid,
        summary: override
          ? unescapeText(firstValue(source.properties, "SUMMARY")?.value ?? summary).trim()
          : summary,
        description: (() => {
          const value = override
            ? firstValue(source.properties, "DESCRIPTION")?.value
            : description;
          const text = value ? unescapeText(value).trim() : "";
          return text.length > 0 ? text : null;
        })(),
        location: (() => {
          const value = override ? firstValue(source.properties, "LOCATION")?.value : location;
          const text = value ? unescapeText(value).trim() : "";
          return text.length > 0 ? text : null;
        })(),
        start,
        end,
        allDay: effectiveStartWall.dateOnly,
        status: override
          ? (firstValue(source.properties, "STATUS")?.value ?? status)
          : status,
        recurrenceId: recurring ? key : null,
        recurring,
        busy: isBusy(source.properties),
      });
    };

    if (!rule) {
      emit(startWall, false);
      continue;
    }

    if (rule.freq !== "DAILY" && rule.freq !== "WEEKLY") {
      // Emit the first instance so the event does not vanish, and say why the
      // rest are missing. Guessing at MONTHLY/YEARLY semantics would put wrong
      // dates in front of students, which is strictly worse than fewer dates.
      unsupported.push(`${uid}: FREQ=${rule.freq} not expanded (${summary})`);
      emit(startWall, false);
      continue;
    }

    const untilUtc = rule.until ? wallTimeToUtc(rule.until, DEFAULT_TIME_ZONE) : null;
    const horizonMs = options.horizon.getTime();

    // WEEKLY with BYDAY repeats on the named days of every Nth week, so the
    // cursor walks whole weeks and the days are filtered inside each one.
    // WEEKLY without BYDAY falls back to DTSTART's own weekday, per RFC 5545.
    const days =
      rule.freq === "WEEKLY"
        ? rule.byDay.length > 0
          ? rule.byDay
          : [weekday(startWall)]
        : [];

    let emitted = 0;
    let cursor = startWall;
    let guard = 0;
    const guardLimit = maxOccurrences * 8;

    outer: while (guard < guardLimit) {
      guard += 1;

      const candidates: WallTime[] =
        rule.freq === "DAILY"
          ? [cursor]
          : // Monday-of-week alignment is not needed: stepping 7 * interval
            // days from DTSTART and offering that week's named days gives the
            // same set, and avoids a WKST argument nothing in our feeds uses.
            days
              .map((day) => {
                const delta = (day - weekday(cursor) + 7) % 7;
                return addDays(cursor, delta);
              })
              .sort((a, b) => occurrenceKey(a).localeCompare(occurrenceKey(b)));

      for (const candidate of candidates) {
        const instant = wallTimeToUtc(candidate, DEFAULT_TIME_ZONE);
        if (instant.getTime() < wallTimeToUtc(startWall, DEFAULT_TIME_ZONE).getTime()) {
          continue;
        }
        if (untilUtc && instant.getTime() > untilUtc.getTime()) break outer;
        if (instant.getTime() > horizonMs) break outer;

        // COUNT counts occurrences the rule generates, including ones EXDATE
        // then removes — so it is incremented before the exclusion test.
        emitted += 1;
        if (rule.count !== null && emitted > rule.count) break outer;
        if (emitted > maxOccurrences) {
          unsupported.push(`${uid}: stopped at ${maxOccurrences} occurrences (${summary})`);
          break outer;
        }

        const key = occurrenceKey(candidate);
        const isOverridden = overrides.has(`${uid}::${key}`);
        if (excluded.has(key) && !isOverridden) continue;
        // `since` is not tested here: `emit` does it, and an occurrence before
        // the window still has to be counted against COUNT above.
        emit(candidate, true);
      }

      cursor = addDays(cursor, rule.freq === "DAILY" ? rule.interval : 7 * rule.interval);
    }
  }

  return { name: calendarName, events: out, unsupported };
}
