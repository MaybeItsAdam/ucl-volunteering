import {
  MAX_LABEL_LENGTH,
  MAX_LINKS_PER_MEMBER,
  normaliseCalendarUrl,
  PROVIDERS,
  type CalendarKind,
} from "@/lib/calendarProviders";
import type { WeekBounds } from "@/lib/planTime";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sessionsToBlocks } from "@/lib/timetableBlocks";
import {
  decryptFeedUrl,
  encryptFeedUrl,
  feedUrlFingerprint,
  isTimetableFeedKeyConfigured,
} from "@/lib/timetableCrypto";
import {
  feedToRows,
  fetchCalendarFeed,
  isStale,
  rowsHash,
  TimetableFeedError,
  type TimetableRow,
} from "@/lib/timetableFeed";
import type { AvailabilityBlock } from "@/lib/types";

/**
 * Committee members' linked calendars, the database half: add, remove,
 * refresh, read. A member may link their UCL timetable and up to four
 * personal calendars (Google, Outlook, iCloud), each refreshed on its own.
 *
 * The links themselves never leave this module except encrypted; nothing
 * here returns one. A personal calendar's events are stored as times only
 * (`feedToRows` drops the rest, and a database check backs it up); the UCL
 * timetable keeps titles and rooms, for its owner's eyes only.
 *
 * Server only (it holds the service-role client).
 */

/** One link as its owner sees it: never the URL. */
export interface CalendarLinkSummary {
  id: string;
  kind: CalendarKind;
  label: string | null;
  lastFetchedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  /** Busy times stored from it, 30 days back to 300 ahead. */
  blockCount: number;
}

export interface CalendarLinksState {
  /** False when `TIMETABLE_FEED_KEY` is unset: nobody can link one. */
  configured: boolean;
  links: CalendarLinkSummary[];
  max: number;
}

export type RefreshOutcome = "updated" | "unchanged" | "error";

type LinkRow = {
  id: string;
  member_id: string;
  kind: CalendarKind;
  label: string | null;
  encrypted_url: string;
  url_hash: string | null;
  etag: string | null;
  last_modified: string | null;
  rows_hash: string | null;
  last_fetched_at: string | null;
  last_status: "ok" | "error" | null;
  last_error: string | null;
  block_count: number;
};

const LINK_COLUMNS =
  "id, member_id, kind, label, encrypted_url, url_hash, etag, last_modified, rows_hash, last_fetched_at, last_status, last_error, block_count";

/** A manual "Sync now" waits this long after the last fetch, so it can't hammer a provider. */
export const MIN_MANUAL_REFRESH_MS = 2 * 60_000;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

function summarise(row: LinkRow): CalendarLinkSummary {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    lastFetchedAt: row.last_fetched_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    blockCount: row.block_count,
  };
}

async function readLinks(memberId: string): Promise<LinkRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_links")
    .select(LINK_COLUMNS)
    .eq("member_id", memberId)
    .order("created_at");
  if (error) fail("Reading calendar links", error);
  return (data ?? []) as LinkRow[];
}

/** The UCL timetable first, then personal calendars in the order they were added. */
export async function getCalendarLinks(memberId: string): Promise<CalendarLinksState> {
  const rows = await readLinks(memberId);
  rows.sort((a, b) => Number(b.kind === "ucl_timetable") - Number(a.kind === "ucl_timetable"));
  return { configured: isTimetableFeedKeyConfigured(), links: rows.map(summarise), max: MAX_LINKS_PER_MEMBER };
}

/** Swap one link's stored blocks for `rows`: delete, then insert in batches. */
async function replaceBlocks(link: Pick<LinkRow, "id" | "kind" | "member_id">, rows: TimetableRow[]): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("calendar_link_blocks").delete().eq("link_id", link.id);
  if (error) fail("Clearing calendar busy times", error);
  const keepsDetails = PROVIDERS[link.kind].keepsDetails;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((row) => ({
      link_id: link.id,
      kind: link.kind,
      member_id: link.member_id,
      uid: row.uid,
      starts_at: row.startTime.toISOString(),
      ends_at: row.endTime.toISOString(),
      title: keepsDetails ? row.title : null,
      location: keepsDetails ? row.location : null,
    }));
    const { error: insertError } = await db.from("calendar_link_blocks").insert(batch);
    if (insertError) fail("Saving calendar busy times", insertError);
  }
}

function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH).trim();
  return text || null;
}

export type AddResult = { ok: true; link: CalendarLinkSummary } | { ok: false; error: string };

/**
 * Check a pasted link by fetching it, then store it (encrypted) with its busy
 * times. A link that doesn't fetch and parse as a calendar is refused before
 * anything is saved, so a typo never replaces a working link.
 *
 * `picked` is the provider chosen in the form; the link's own host decides
 * what it is, and `picked` only chooses the advice for a link from elsewhere.
 * A new UCL timetable replaces the old one (there is one timetable per
 * student); anything else is added alongside, up to the cap.
 */
export async function addCalendarLink(
  memberId: string,
  picked: CalendarKind,
  rawUrl: string,
  rawLabel: unknown,
  now = new Date(),
): Promise<AddResult> {
  if (!isTimetableFeedKeyConfigured()) return { ok: false, error: "Calendar links aren't set up on this site yet" };
  const normalised = normaliseCalendarUrl(rawUrl, picked);
  if (!normalised.ok) return { ok: false, error: normalised.error };
  const { url, kind } = normalised;
  const hash = feedUrlFingerprint(url);

  const existing = await readLinks(memberId);
  if (existing.some((row) => row.url_hash === hash)) {
    return { ok: false, error: "You've already linked this calendar" };
  }
  const replacing = kind === "ucl_timetable" ? existing.find((row) => row.kind === "ucl_timetable") : undefined;
  if (!replacing && existing.length >= MAX_LINKS_PER_MEMBER) {
    return {
      ok: false,
      error: `You can link up to ${MAX_LINKS_PER_MEMBER} calendars\nRemove one to add another`,
    };
  }

  let fetched;
  try {
    fetched = await fetchCalendarFeed(url, kind);
    if (fetched.kind !== "ok") {
      throw new TimetableFeedError(`${PROVIDERS[kind].server} sent back an empty response\nTry again in a minute`);
    }
  } catch (error) {
    if (error instanceof TimetableFeedError) return { ok: false, error: error.message };
    throw error;
  }
  const { rows } = feedToRows(fetched.body, now, kind);

  const fields = {
    member_id: memberId,
    kind,
    label: cleanLabel(rawLabel),
    encrypted_url: encryptFeedUrl(url),
    url_hash: hash,
    etag: fetched.etag,
    last_modified: fetched.lastModified,
    rows_hash: rowsHash(rows),
    last_fetched_at: now.toISOString(),
    last_status: "ok" as const,
    last_error: null,
    block_count: rows.length,
  };
  const db = getSupabaseAdmin();
  const { data, error } = replacing
    ? await db.from("calendar_links").update(fields).eq("id", replacing.id).select(LINK_COLUMNS).single()
    : await db.from("calendar_links").insert(fields).select(LINK_COLUMNS).single();
  if (error) {
    // Two tabs adding at once: the database's own unique index and cap catch it.
    if (error.code === "23505") return { ok: false, error: "You've already linked this calendar" };
    if (error.code === "23514") {
      return { ok: false, error: `You can link up to ${MAX_LINKS_PER_MEMBER} calendars\nRemove one to add another` };
    }
    fail("Saving a calendar link", error);
  }
  const saved = data as LinkRow;
  await replaceBlocks(saved, rows);
  return { ok: true, link: summarise(saved) };
}

/** Forget one of the member's links and every busy time from it. False if it wasn't theirs. */
export async function removeCalendarLink(memberId: string, linkId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_links")
    .delete()
    .eq("id", linkId)
    .eq("member_id", memberId)
    .select("id");
  if (error) fail("Removing a calendar link", error);
  return (data ?? []).length > 0;
}

async function recordStatus(linkId: string, fields: Partial<LinkRow>): Promise<void> {
  const { error } = await getSupabaseAdmin().from("calendar_links").update(fields).eq("id", linkId);
  if (error) fail("Recording a calendar refresh", error);
}

/**
 * Fetch one link again. Conditional on the stored validators, and the busy
 * times are only rewritten when the rows actually changed. A failure keeps
 * the last good busy times and records why, for the owner to see.
 */
export async function refreshCalendarLink(link: LinkRow, now = new Date()): Promise<RefreshOutcome> {
  const url = decryptFeedUrl(link.encrypted_url);
  if (!url) {
    await recordStatus(link.id, {
      last_fetched_at: now.toISOString(),
      last_status: "error",
      last_error: "This link can't be read any more\nRemove it and add it again",
    });
    return "error";
  }
  // Links carried over from the timetable-only table have no fingerprint yet.
  const backfill = link.url_hash ? {} : { url_hash: feedUrlFingerprint(url) };

  try {
    const fetched = await fetchCalendarFeed(url, link.kind, { etag: link.etag, lastModified: link.last_modified });
    if (fetched.kind === "not-modified") {
      await recordStatus(link.id, { ...backfill, last_fetched_at: now.toISOString(), last_status: "ok", last_error: null });
      return "unchanged";
    }
    const { rows } = feedToRows(fetched.body, now, link.kind);
    const hash = rowsHash(rows);
    const changed = hash !== link.rows_hash;
    if (changed) await replaceBlocks(link, rows);
    await recordStatus(link.id, {
      ...backfill,
      etag: fetched.etag,
      last_modified: fetched.lastModified,
      rows_hash: hash,
      block_count: rows.length,
      last_fetched_at: now.toISOString(),
      last_status: "ok",
      last_error: null,
    });
    return changed ? "updated" : "unchanged";
  } catch (error) {
    const message =
      error instanceof TimetableFeedError ? error.message : "Couldn't refresh this calendar\nIt will try again later";
    if (!(error instanceof TimetableFeedError)) console.error("[calendar-links] refresh failed", error);
    await recordStatus(link.id, { last_fetched_at: now.toISOString(), last_status: "error", last_error: message });
    return "error";
  }
}

/**
 * Refresh the member's links now, or just `linkId`, skipping any fetched in
 * the last two minutes. For the sheet's "Sync now"; returns how many it tried.
 */
export async function refreshMemberLinks(memberId: string, linkId?: string, now = new Date()): Promise<number> {
  const links = (await readLinks(memberId)).filter(
    (link) =>
      (!linkId || link.id === linkId) &&
      (!link.last_fetched_at || now.getTime() - new Date(link.last_fetched_at).getTime() >= MIN_MANUAL_REFRESH_MS),
  );
  await Promise.all(links.map((link) => refreshCalendarLink(link, now)));
  return links.length;
}

/**
 * Refresh each of one member's links that hasn't been fetched for six hours.
 * For `after()` on the pages that show them: never throws, never blocks a render.
 */
export async function refreshIfStale(memberId: string, now = new Date()): Promise<void> {
  try {
    if (!isTimetableFeedKeyConfigured()) return;
    const stale = (await readLinks(memberId)).filter((link) =>
      isStale(link.last_fetched_at ? new Date(link.last_fetched_at) : null, now),
    );
    // Side by side: five slow providers one after another could outlast the request.
    await Promise.all(stale.map((link) => refreshCalendarLink(link, now)));
  } catch (error) {
    console.error("[calendar-links] background refresh failed", error);
  }
}

/** Links whose last fetch is older than `staleMs`, oldest first. */
export async function listDueLinks(now: Date, staleMs: number, limit: number): Promise<LinkRow[]> {
  const cutoff = new Date(now.getTime() - staleMs).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_links")
    .select(LINK_COLUMNS)
    .or(`last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`)
    .order("last_fetched_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) fail("Listing calendars to refresh", error);
  return (data ?? []) as LinkRow[];
}

type BlockRow = {
  link_id: string;
  kind: CalendarKind;
  member_id: string;
  uid: string;
  starts_at: string;
  ends_at: string;
  title?: string | null;
  location?: string | null;
};

/**
 * Busy times overlapping [from, to) as sessions for `sessionsToBlocks`. Only
 * the viewer's own rows select titles and rooms; everyone else's never fetch
 * them, so they can't leak into another member's view.
 */
async function readBlocks(memberIds: string[], from: Date, to: Date, own: boolean): Promise<BlockRow[]> {
  if (memberIds.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_link_blocks")
    .select(own ? "link_id, kind, member_id, uid, starts_at, ends_at, title, location" : "link_id, kind, member_id, uid, starts_at, ends_at")
    .in("member_id", memberIds)
    .lt("starts_at", to.toISOString())
    .gt("ends_at", from.toISOString())
    .order("starts_at")
    .limit(own ? 1000 : 5000);
  if (error) fail("Reading calendar busy times", error);
  return (data ?? []) as unknown as BlockRow[];
}

/**
 * A London week of linked calendars as availability blocks: the viewer's own
 * with their timetable's titles and rooms and "Busy (Google)" for the rest,
 * everyone else's as busy time only.
 */
export async function calendarBlocksForWeek(
  viewerId: string,
  memberIds: string[],
  week: WeekBounds,
): Promise<AvailabilityBlock[]> {
  const others = memberIds.filter((id) => id !== viewerId);
  const [own, busy] = await Promise.all([
    readBlocks([viewerId], week.start, week.end, true),
    readBlocks(others, week.start, week.end, false),
  ]);
  const toSession = (row: BlockRow, mine: boolean) => ({
    memberId: row.member_id,
    // Unique across a member's links: two calendars can hold the same event.
    uid: `${row.link_id}:${row.uid}`,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    title: mine ? (row.title ?? undefined) : undefined,
    location: mine ? (row.location ?? null) : null,
    kind: row.kind,
    mine,
  });
  return sessionsToBlocks([...own.map((r) => toSession(r, true)), ...busy.map((r) => toSession(r, false))], week.days);
}
