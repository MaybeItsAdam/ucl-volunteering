import { createHash } from "crypto";
import { lookup } from "dns/promises";
import { parseIcs } from "@/lib/ics";
import { isReservedAddress } from "@/lib/reservedAddress";

/**
 * A committee member's UCL timetable, the pure half: what a pasted link may
 * be, how it is fetched, and how a feed becomes rows. No database here; that
 * half is `timetable.ts`. Ported from Adam's Campus Toolbox
 * (`personalTimetableFeed.ts`), so the two accept and refuse the same links.
 *
 * ## The link is UCL's, and only UCL's
 *
 * UCL's timetable site (timetable.ucl.ac.uk, behind SSO) has a "Subscribe"
 * button whose link looks like `webcal://www.ucl.ac.uk/timetable/ics/<token>` —
 * no extension, a live iCalendar feed, and a bearer secret.
 *
 * The allow-list is **deliberately UCL-only** (`www.ucl.ac.uk/timetable/ics/…`
 * and `timetable.ucl.ac.uk`), not "any https .ics":
 *
 *  - This server fetches the link on a schedule, unattended, for every user. An
 *    open URL field is a signed-in, scheduled request forwarder; a fixed host
 *    makes the SSRF question nearly moot (the address check below is the
 *    belt to that braces, for redirects and DNS surprises).
 *  - The feature is "my lectures as busy time on the plan". A Google or
 *    Outlook calendar would be a different, larger feature and should be
 *    decided as one.
 */

/** Hosts a pasted link may name. Path rules are in `normaliseTimetableUrl`. */
export const ALLOWED_FEED_HOSTS = ["www.ucl.ac.uk", "timetable.ucl.ac.uk"] as const;

/** Where the "Open UCL timetable" button goes. */
export const UCL_TIMETABLE_SITE = "https://timetable.ucl.ac.uk";

const MAX_URL_LENGTH = 500;
/** A full-year UCL feed is a few hundred KB; 5 MB is a mistake or an attack. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** Expansion window kept in the table, relative to the refresh. */
export const KEEP_PAST_DAYS = 30;
export const KEEP_FUTURE_DAYS = 300;
/** Hard ceiling on stored occurrences per user — about two years of a heavy timetable. */
export const MAX_EVENTS_PER_USER = 2_000;
const MAX_TITLE = 160;
const MAX_LOCATION = 160;
const MAX_DESCRIPTION = 280;

export type NormalisedUrl = { ok: true; url: string } | { ok: false; error: string };

export const PAGE_NOT_LINK_ERROR =
  "That looks like the timetable page, not the Subscribe link\nOn timetable.ucl.ac.uk, tap Subscribe and copy the link it gives you";
const NOT_UCL_ERROR =
  "Only UCL timetable links work here\nIt should start webcal://www.ucl.ac.uk/timetable/ics/";

/**
 * Turn whatever was pasted into the canonical https URL, or say what is wrong.
 *
 * `webcal://` (what the Subscribe button gives) and `http://` both become
 * `https://`; a bare `www.ucl.ac.uk/...` gains a scheme; `ucl.ac.uk` gains
 * its `www`. Anything that is not https after that is refused.
 */
export function normaliseTimetableUrl(raw: string): NormalisedUrl {
  let text = raw.trim().replace(/^<|>$/g, "");
  if (!text) return { ok: false, error: "Paste your timetable's Subscribe link" };
  if (text.length > MAX_URL_LENGTH) return { ok: false, error: "That link is too long to be a timetable link" };

  if (/^webcals?:\/\//i.test(text)) text = text.replace(/^webcals?:\/\//i, "https://");
  else if (/^http:\/\//i.test(text)) text = text.replace(/^http:\/\//i, "https://");
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "That isn't a link\nCopy the Subscribe link from your UCL timetable" };
  }
  if (url.protocol !== "https:") return { ok: false, error: NOT_UCL_ERROR };
  if (url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, error: NOT_UCL_ERROR };
  }

  let host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "ucl.ac.uk") host = "www.ucl.ac.uk";
  url.hostname = host;
  url.port = "";
  url.hash = "";

  if (host === "www.ucl.ac.uk") {
    if (/^\/timetable\/ics\/[A-Za-z0-9_-]{6,}\/?$/.test(url.pathname)) return { ok: true, url: url.toString() };
    if (url.pathname.startsWith("/timetable")) return { ok: false, error: PAGE_NOT_LINK_ERROR };
    return { ok: false, error: NOT_UCL_ERROR };
  }
  if (host === "timetable.ucl.ac.uk") {
    // The feed path on this host is not documented; anything that names an
    // ics endpoint is tried, and the fetch's VCALENDAR check is the real test.
    if (/(^|\/)ics(\/|$)|\.ics$/i.test(url.pathname)) return { ok: true, url: url.toString() };
    return { ok: false, error: PAGE_NOT_LINK_ERROR };
  }
  return { ok: false, error: NOT_UCL_ERROR };
}

/** Whether a redirect target is acceptable: https, and a ucl.ac.uk host. */
export function isAllowedRedirect(target: URL): boolean {
  if (target.protocol !== "https:") return false;
  if (target.username || target.password) return false;
  if (target.port && target.port !== "443") return false;
  const host = target.hostname.toLowerCase().replace(/\.$/, "");
  return host === "ucl.ac.uk" || host.endsWith(".ucl.ac.uk");
}

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
): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookupImpl(host);
  } catch {
    throw new TimetableFeedError("Couldn't reach UCL's timetable server\nTry again in a minute");
  }
  if (addresses.length === 0 || addresses.some((a) => isReservedAddress(a.address))) {
    throw new TimetableFeedError("Couldn't reach UCL's timetable server\nTry again in a minute");
  }
}

/** Read a body up to `limit` bytes, aborting past it rather than buffering it. */
async function readCapped(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > limit) throw new TimetableFeedError("That feed is far larger than a timetable", true);
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
      throw new TimetableFeedError("That feed is far larger than a timetable", true);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const defaultLookup = (host: string) => lookup(host, { all: true });

/**
 * Fetch a normalised feed URL, conditionally when validators are given.
 *
 * Redirects are followed by hand (at most three) so each hop is re-checked:
 * https, a ucl.ac.uk host, and every resolved address public.
 */
export async function fetchTimetableFeed(
  feedUrl: string,
  validators: { etag?: string | null; lastModified?: string | null } = {},
  deps: FeedFetchDeps = {},
): Promise<FeedFetchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookupImpl = deps.lookupImpl ?? defaultLookup;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? FETCH_TIMEOUT_MS);

  try {
    let current = new URL(feedUrl);
    for (let hop = 0; ; hop++) {
      if (!isAllowedRedirect(current)) {
        throw new TimetableFeedError("That link pointed somewhere other than UCL", true);
      }
      await assertPublicHost(current.hostname, lookupImpl);

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
            ? "UCL's timetable server took too long to answer\nTry again in a minute"
            : "Couldn't reach UCL's timetable server\nTry again in a minute",
        );
      }

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS) {
          throw new TimetableFeedError("UCL's timetable server sent us in circles");
        }
        current = new URL(location, current);
        continue;
      }
      if (response.status === 304) return { kind: "not-modified" };
      if (response.status === 404 || response.status === 410) {
        throw new TimetableFeedError(
          "UCL no longer recognises this link, so it may have been reset\nCopy a fresh Subscribe link",
          true,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new TimetableFeedError(
          "UCL refused this link\nCopy a fresh Subscribe link from your timetable",
          true,
        );
      }
      if (!response.ok) {
        throw new TimetableFeedError(`UCL's timetable server answered ${response.status}. We'll retry later.`);
      }

      const body = await readCapped(response, MAX_FEED_BYTES);
      validateFeedBody(body, response.headers.get("content-type"));
      return {
        kind: "ok",
        body,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    }
  } catch (error) {
    if (error instanceof TimetableFeedError) throw error;
    throw new TimetableFeedError("Couldn't read UCL's timetable feed\nTry again in a minute");
  } finally {
    clearTimeout(timer);
  }
}

/** Throws a student-facing error unless `body` is an iCalendar document. */
export function validateFeedBody(body: string, contentType: string | null): void {
  const head = body.slice(0, 2_048).replace(/^﻿/, "").trimStart();
  if (head.startsWith("BEGIN:VCALENDAR")) return;
  if (/^<(!doctype|html)/i.test(head) || (contentType ?? "").includes("html")) {
    throw new TimetableFeedError(PAGE_NOT_LINK_ERROR, true);
  }
  throw new TimetableFeedError("That link didn't return a calendar\nCopy the Subscribe link again", true);
}

/** One stored occurrence, as written to `timetable_sessions`. */
export type TimetableRow = {
  uid: string;
  startTime: Date;
  endTime: Date;
  title: string;
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
 * Kept: timed occurrences from `now - 30d` to `now + 300d`, not cancelled.
 * All-day listings are dropped (UCL marks reading weeks and closures that way,
 * and a lecture layer has no all-day lane worth spending a row on). `uid` is
 * a short hash of UID + occurrence, so a weekly series gets one row per week
 * and the unique index stays small.
 */
export function feedToRows(body: string, now: Date): { rows: TimetableRow[]; unsupported: number } {
  const since = new Date(now.getTime() - KEEP_PAST_DAYS * 86_400_000);
  const horizon = new Date(now.getTime() + KEEP_FUTURE_DAYS * 86_400_000);
  const calendar = parseIcs(body, { since, horizon });
  const seen = new Set<string>();
  const rows: TimetableRow[] = [];
  for (const event of calendar.events) {
    if (event.allDay) continue;
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
      title: clip(event.summary, MAX_TITLE) ?? "Timetabled session",
      location: clip(event.location, MAX_LOCATION),
      description: clip(event.description, MAX_DESCRIPTION),
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
      `${row.uid}|${row.startTime.getTime()}|${row.endTime.getTime()}|${row.title}|${row.location ?? ""}|${row.description ?? ""}\n`,
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
