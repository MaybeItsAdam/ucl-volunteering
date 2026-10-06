import { createHash } from "crypto";
import { lookup } from "dns/promises";
import { PROVIDERS, isAllowedRedirectFor, type CalendarKind } from "@/lib/calendarProviders";
import { parseIcs } from "@/lib/ics";
import { isReservedAddress } from "@/lib/reservedAddress";

/**
 * A committee member's linked calendars — the UCL timetable and personal
 * Google, Outlook and iCloud calendars — the fetching half: how a link is
 * fetched, and how a feed becomes rows. No database here; that half is
 * `calendarLinks.ts`. What a pasted link may be is `calendarProviders.ts`.
 * The UCL half is ported from Adam's Campus Toolbox (`personalTimetableFeed.ts`),
 * so the two accept and refuse the same timetable links.
 *
 * Every fetch is to one provider's fixed hosts, redirects are followed by
 * hand and re-checked against those hosts, and every resolved address must be
 * public: see `fetchCalendarFeed`.
 */

export {
  ALLOWED_FEED_HOSTS,
  isAllowedRedirect,
  normaliseTimetableUrl,
  PAGE_NOT_LINK_ERROR,
  type NormalisedUrl,
} from "@/lib/calendarProviders";

/** Where the "Open UCL timetable" button goes. */
export const UCL_TIMETABLE_SITE = PROVIDERS.ucl_timetable.site;

/** A full-year UCL feed is a few hundred KB; 5 MB is a mistake or an attack. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** Expansion window kept in the table, relative to the refresh. */
export const KEEP_PAST_DAYS = 30;
export const KEEP_FUTURE_DAYS = 300;
/** Hard ceiling on stored occurrences per link — about two years of a heavy timetable. */
export const MAX_EVENTS_PER_USER = 2_000;
const MAX_TITLE = 160;
const MAX_LOCATION = 160;
const MAX_DESCRIPTION = 280;

/** A failure that is safe and useful to show the student. Never contains the URL. */
export class TimetableFeedError extends Error {
  constructor(
    message: string,
    /** True when retrying the same link will not help (revoked / wrong link). */
    readonly permanent = false,
  ) {
    super(message);
    this.name = "TimetableFeedError";
  }
}

export type FeedFetchResult =
  | { kind: "not-modified" }
  | { kind: "ok"; body: string; etag: string | null; lastModified: string | null };

export type FeedFetchDeps = {
  fetchImpl?: typeof fetch;
  lookupImpl?: (host: string) => Promise<{ address: string }[]>;
  timeoutMs?: number;
};

async function assertPublicHost(
  host: string,
  lookupImpl: (host: string) => Promise<{ address: string }[]>,
  kind: CalendarKind,
): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookupImpl(host);
  } catch {
    throw new TimetableFeedError(`Couldn't reach ${PROVIDERS[kind].server}\nTry again in a minute`);
  }
  if (addresses.length === 0 || addresses.some((a) => isReservedAddress(a.address))) {
    throw new TimetableFeedError(`Couldn't reach ${PROVIDERS[kind].server}\nTry again in a minute`);
  }
}

const TOO_LARGE = "That feed is far larger than a calendar we can read";

/** Read a body up to `limit` bytes, aborting past it rather than buffering it. */
async function readCapped(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > limit) throw new TimetableFeedError(TOO_LARGE, true);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new TimetableFeedError(TOO_LARGE, true);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const defaultLookup = (host: string) => lookup(host, { all: true });

/** A UCL timetable feed; `fetchCalendarFeed` for the rules. */
export function fetchTimetableFeed(
  feedUrl: string,
  validators: { etag?: string | null; lastModified?: string | null } = {},
  deps: FeedFetchDeps = {},
): Promise<FeedFetchResult> {
  return fetchCalendarFeed(feedUrl, "ucl_timetable", validators, deps);
}

/**
 * Fetch a normalised feed URL of `kind`, conditionally when validators are given.
 *
 * Redirects are followed by hand (at most three) so each hop is re-checked:
 * https, one of that provider's own hosts, and every resolved address public.
 * The body is capped at 5 MB and the whole fetch at 15 seconds.
 */
export async function fetchCalendarFeed(
  feedUrl: string,
  kind: CalendarKind,
  validators: { etag?: string | null; lastModified?: string | null } = {},
  deps: FeedFetchDeps = {},
): Promise<FeedFetchResult> {
  const provider = PROVIDERS[kind];
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookupImpl = deps.lookupImpl ?? defaultLookup;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? FETCH_TIMEOUT_MS);

  try {
    let current = new URL(feedUrl);
    for (let hop = 0; ; hop++) {
      if (!isAllowedRedirectFor(kind, current)) {
        throw new TimetableFeedError(`That link pointed somewhere other than ${provider.owner}`, true);
      }
      await assertPublicHost(current.hostname, lookupImpl, kind);

      const headers: Record<string, string> = {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (compatible; UCLVolunteeringSociety/1.0; +https://uclvolunteering.org)",
      };
      if (validators.etag) headers["If-None-Match"] = validators.etag;
      if (validators.lastModified) headers["If-Modified-Since"] = validators.lastModified;

      let response: Response;
      try {
        response = await fetchImpl(current.toString(), {
          headers,
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
        });
      } catch {
        throw new TimetableFeedError(
          controller.signal.aborted
            ? `${provider.server} took too long to answer\nTry again in a minute`
            : `Couldn't reach ${provider.server}\nTry again in a minute`,
        );
      }

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS) {
          throw new TimetableFeedError(`${provider.server} sent us in circles`);
        }
        current = new URL(location, current);
        continue;
      }
      if (response.status === 304) return { kind: "not-modified" };
      if (response.status === 404 || response.status === 410) {
        throw new TimetableFeedError(
          `${provider.owner} no longer recognises this link, so it may have been reset\n${provider.freshLink}`,
          true,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new TimetableFeedError(`${provider.owner} refused this link\n${provider.freshLink}`, true);
      }
      if (!response.ok) {
        throw new TimetableFeedError(`${provider.server} answered ${response.status}\nWe'll try again later`);
      }

      const body = await readCapped(response, MAX_FEED_BYTES);
      validateFeedBody(body, response.headers.get("content-type"), kind);
      return {
        kind: "ok",
        body,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    }
  } catch (error) {
    if (error instanceof TimetableFeedError) throw error;
    throw new TimetableFeedError(`Couldn't read the feed from ${provider.server}\nTry again in a minute`);
  } finally {
    clearTimeout(timer);
  }
}

/** Throws a member-facing error unless `body` is an iCalendar document. */
export function validateFeedBody(
  body: string,
  contentType: string | null,
  kind: CalendarKind = "ucl_timetable",
): void {
  const head = body.slice(0, 2_048).replace(/^﻿/, "").trimStart();
  if (head.startsWith("BEGIN:VCALENDAR")) return;
  if (/^<(!doctype|html)/i.test(head) || (contentType ?? "").includes("html")) {
    throw new TimetableFeedError(PROVIDERS[kind].pageError, true);
  }
  throw new TimetableFeedError(
    kind === "ucl_timetable"
      ? "That link didn't return a calendar\nCopy the Subscribe link again"
      : "That link didn't return a calendar\nCopy it again and paste the whole thing",
    true,
  );
}

/**
 * One stored occurrence, as written to `calendar_link_blocks`. A personal
 * calendar's rows never carry a title, room or description: only when.
 */
export type TimetableRow = {
  uid: string;
  startTime: Date;
  endTime: Date;
  title: string | null;
  location: string | null;
  description: string | null;
};

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  const text = value.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Feed text → the rows to store, sorted by start.
 *
 * Kept: timed occurrences from `now - 30d` to `now + 300d`, not cancelled,
 * not marked free (`TRANSP:TRANSPARENT`, or Outlook's `BUSYSTATUS:FREE`).
 * All-day listings are dropped (UCL marks reading weeks and closures that way,
 * personal calendars birthdays and holidays, and an all-day "busy" would blank
 * the whole day). `uid` is a short hash of UID + occurrence, so a weekly
 * series gets one row per week and the unique index stays small.
 *
 * Only the UCL timetable keeps titles and rooms (`PROVIDERS[kind].keepsDetails`);
 * a personal calendar's are dropped here, before anything is stored.
 */
export function feedToRows(
  body: string,
  now: Date,
  kind: CalendarKind = "ucl_timetable",
): { rows: TimetableRow[]; unsupported: number } {
  const keepsDetails = PROVIDERS[kind].keepsDetails;
  const since = new Date(now.getTime() - KEEP_PAST_DAYS * 86_400_000);
  const horizon = new Date(now.getTime() + KEEP_FUTURE_DAYS * 86_400_000);
  const calendar = parseIcs(body, { since, horizon });
  const seen = new Set<string>();
  const rows: TimetableRow[] = [];
  for (const event of calendar.events) {
    if (event.allDay) continue;
    if (!event.busy) continue;
    if ((event.status ?? "").toUpperCase() === "CANCELLED") continue;
    if (event.start < since || event.start > horizon) continue;
    const key = `${event.uid}::${event.recurrenceId ?? event.start.toISOString()}`;
    const uid = createHash("sha256").update(key).digest("base64url").slice(0, 22);
    if (seen.has(uid)) continue;
    seen.add(uid);
    rows.push({
      uid,
      startTime: event.start,
      endTime: event.end > event.start ? event.end : new Date(event.start.getTime() + 3_600_000),
      title: keepsDetails ? (clip(event.summary, MAX_TITLE) ?? "Timetabled session") : null,
      location: keepsDetails ? clip(event.location, MAX_LOCATION) : null,
      description: keepsDetails ? clip(event.description, MAX_DESCRIPTION) : null,
    });
  }
  rows.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return { rows: rows.slice(0, MAX_EVENTS_PER_USER), unsupported: calendar.unsupported.length };
}

/**
 * Fingerprint of the rows, not the body: generated feeds restamp `DTSTAMP` on
 * every request, so hashing the text would rewrite every row every refresh.
 */
export function rowsHash(rows: TimetableRow[]): string {
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(
      `${row.uid}|${row.startTime.getTime()}|${row.endTime.getTime()}|${row.title ?? ""}|${row.location ?? ""}|${row.description ?? ""}\n`,
    );
  }
  return hash.digest("base64url").slice(0, 32);
}

/** Max span a read may ask for — ten weeks, enough for any view plus its scroll margin. */
export const MAX_WINDOW_DAYS = 70;

/**
 * Parse and clamp a `from`/`to` query to a bounded window. Missing or invalid
 * values default to two weeks back / eight weeks ahead of `now`.
 */
export function clampWindow(
  fromRaw: string | null,
  toRaw: string | null,
  now: Date,
): { from: Date; to: Date } {
  const parse = (raw: string | null) => {
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const from = parse(fromRaw) ?? new Date(now.getTime() - 14 * 86_400_000);
  let to = parse(toRaw) ?? new Date(from.getTime() + 56 * 86_400_000);
  if (to <= from) to = new Date(from.getTime() + 86_400_000);
  const max = from.getTime() + MAX_WINDOW_DAYS * 86_400_000;
  if (to.getTime() > max) to = new Date(max);
  return { from, to };
}

/** How old a sync may be before a view triggers a background refresh. */
export const STALE_AFTER_MS = 6 * 3_600_000;

export function isStale(lastFetchedAt: Date | null, now: Date): boolean {
  return !lastFetchedAt || now.getTime() - lastFetchedAt.getTime() > STALE_AFTER_MS;
}
