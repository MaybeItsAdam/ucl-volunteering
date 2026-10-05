import type { WeekBounds } from "@/lib/planTime";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sessionsToBlocks } from "@/lib/timetableBlocks";
import type { AvailabilityBlock } from "@/lib/types";
import { decryptFeedUrl, encryptFeedUrl, isTimetableFeedKeyConfigured } from "@/lib/timetableCrypto";
import {
  feedToRows,
  fetchTimetableFeed,
  isStale,
  normaliseTimetableUrl,
  rowsHash,
  TimetableFeedError,
  validateFeedBody,
  type TimetableRow,
} from "@/lib/timetableFeed";

/**
 * Committee members' UCL timetables, the database half: link, unlink,
 * refresh, read. The link itself never leaves this module except encrypted;
 * nothing here returns it.
 *
 * Server only (it holds the service-role client).
 */

export interface TimetableStatus {
  /** False when `TIMETABLE_FEED_KEY` is unset: nobody can link one. */
  configured: boolean;
  linked: boolean;
  lastFetchedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  sessionCount: number;
}

/** A session as its owner sees it. */
export interface TimetableSession {
  uid: string;
  startsAt: string;
  endsAt: string;
  title: string;
  location: string | null;
}

/** Someone else's session: just the busy time. */
export interface BusySession {
  memberId: string;
  startsAt: string;
  endsAt: string;
}

export type RefreshOutcome = "updated" | "unchanged" | "error";

type SubscriptionRow = {
  member_id: string;
  encrypted_url: string;
  etag: string | null;
  last_modified: string | null;
  rows_hash: string | null;
  last_fetched_at: string | null;
  last_status: "ok" | "error" | null;
  last_error: string | null;
};

const SUBSCRIPTION_COLUMNS =
  "member_id, encrypted_url, etag, last_modified, rows_hash, last_fetched_at, last_status, last_error";

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

async function readSubscription(memberId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("timetable_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) fail("Reading a timetable link", error);
  return (data as SubscriptionRow | null) ?? null;
}

export async function getTimetableStatus(memberId: string): Promise<TimetableStatus> {
  const configured = isTimetableFeedKeyConfigured();
  const sub = await readSubscription(memberId);
  let sessionCount = 0;
  if (sub) {
    const { count, error } = await getSupabaseAdmin()
      .from("timetable_sessions")
      .select("uid", { count: "exact", head: true })
      .eq("member_id", memberId);
    if (error) fail("Counting timetable sessions", error);
    sessionCount = count ?? 0;
  }
  return {
    configured,
    linked: Boolean(sub),
    lastFetchedAt: sub?.last_fetched_at ?? null,
    lastStatus: sub?.last_status ?? null,
    lastError: sub?.last_error ?? null,
    sessionCount,
  };
}

/** Swap the stored sessions for `rows`: delete, then insert in batches. */
async function replaceSessions(memberId: string, rows: TimetableRow[]): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("timetable_sessions").delete().eq("member_id", memberId);
  if (error) fail("Clearing timetable sessions", error);
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((row) => ({
      member_id: memberId,
      uid: row.uid,
      starts_at: row.startTime.toISOString(),
      ends_at: row.endTime.toISOString(),
      title: row.title,
      location: row.location,
    }));
    const { error: insertError } = await db.from("timetable_sessions").insert(batch);
    if (insertError) fail("Saving timetable sessions", insertError);
  }
}

/**
 * Check a pasted link by fetching it, then store it (encrypted) with its
 * sessions. A link that doesn't fetch and parse as a timetable is refused
 * before anything is saved, so a typo never replaces a working link.
 */
export async function linkTimetable(
  memberId: string,
  rawUrl: string,
  now = new Date(),
): Promise<{ ok: true; sessionCount: number } | { ok: false; error: string }> {
  if (!isTimetableFeedKeyConfigured()) return { ok: false, error: "Timetable links aren't set up on this site yet" };
  const normalised = normaliseTimetableUrl(rawUrl);
  if (!normalised.ok) return { ok: false, error: normalised.error };

  let fetched;
  try {
    fetched = await fetchTimetableFeed(normalised.url);
    if (fetched.kind !== "ok") throw new TimetableFeedError("UCL sent back an empty response\nTry again in a minute");
    validateFeedBody(fetched.body, null);
  } catch (error) {
    if (error instanceof TimetableFeedError) return { ok: false, error: error.message };
    throw error;
  }
  const { rows } = feedToRows(fetched.body, now);

  const { error } = await getSupabaseAdmin()
    .from("timetable_subscriptions")
    .upsert({
      member_id: memberId,
      encrypted_url: encryptFeedUrl(normalised.url),
      etag: fetched.etag,
      last_modified: fetched.lastModified,
      rows_hash: rowsHash(rows),
      last_fetched_at: now.toISOString(),
      last_status: "ok",
      last_error: null,
    });
  if (error) fail("Saving a timetable link", error);
  await replaceSessions(memberId, rows);
  return { ok: true, sessionCount: rows.length };
}

/** Forget the link and every session from it. */
export async function unlinkTimetable(memberId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("timetable_sessions").delete().eq("member_id", memberId);
  if (error) fail("Clearing timetable sessions", error);
  const { error: subError } = await db.from("timetable_subscriptions").delete().eq("member_id", memberId);
  if (subError) fail("Removing a timetable link", subError);
}

async function recordStatus(memberId: string, fields: Partial<SubscriptionRow>): Promise<void> {
  const { error } = await getSupabaseAdmin().from("timetable_subscriptions").update(fields).eq("member_id", memberId);
  if (error) fail("Recording a timetable refresh", error);
}

/**
 * Fetch a member's feed again. Conditional on the stored validators, and the
 * sessions are only rewritten when the rows actually changed. A failure keeps
 * the last good sessions and records why.
 */
export async function refreshTimetable(memberId: string, now = new Date()): Promise<RefreshOutcome> {
  const sub = await readSubscription(memberId);
  if (!sub) return "unchanged";
  const url = decryptFeedUrl(sub.encrypted_url);
  if (!url) {
    await recordStatus(memberId, {
      last_fetched_at: now.toISOString(),
      last_status: "error",
      last_error: "This link can't be read any more\nPaste it again",
    });
    return "error";
  }

  try {
    const fetched = await fetchTimetableFeed(url, { etag: sub.etag, lastModified: sub.last_modified });
    if (fetched.kind === "not-modified") {
      await recordStatus(memberId, { last_fetched_at: now.toISOString(), last_status: "ok", last_error: null });
      return "unchanged";
    }
    validateFeedBody(fetched.body, null);
    const { rows } = feedToRows(fetched.body, now);
    const hash = rowsHash(rows);
    const changed = hash !== sub.rows_hash;
    if (changed) await replaceSessions(memberId, rows);
    await recordStatus(memberId, {
      etag: fetched.etag,
      last_modified: fetched.lastModified,
      rows_hash: hash,
      last_fetched_at: now.toISOString(),
      last_status: "ok",
      last_error: null,
    });
    return changed ? "updated" : "unchanged";
  } catch (error) {
    const message =
      error instanceof TimetableFeedError ? error.message : "Couldn't refresh your timetable\nIt will try again later";
    if (!(error instanceof TimetableFeedError)) console.error("[timetable] refresh failed", error);
    await recordStatus(memberId, { last_fetched_at: now.toISOString(), last_status: "error", last_error: message });
    return "error";
  }
}

/**
 * Refresh one member's timetable if it hasn't been fetched for six hours. For
 * `after()` on the pages that show it: never throws, never blocks a render.
 */
export async function refreshIfStale(memberId: string, now = new Date()): Promise<void> {
  try {
    if (!isTimetableFeedKeyConfigured()) return;
    const sub = await readSubscription(memberId);
    if (!sub || !isStale(sub.last_fetched_at ? new Date(sub.last_fetched_at) : null, now)) return;
    await refreshTimetable(memberId, now);
  } catch (error) {
    console.error("[timetable] background refresh failed", error);
  }
}

/** Members whose last fetch is older than `staleMs`, oldest first. */
export async function listDueTimetables(now: Date, staleMs: number, limit: number): Promise<string[]> {
  const cutoff = new Date(now.getTime() - staleMs).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("timetable_subscriptions")
    .select("member_id")
    .or(`last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`)
    .order("last_fetched_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) fail("Listing timetables to refresh", error);
  return (data ?? []).map((row) => row.member_id as string);
}

/** One member's own sessions overlapping [from, to), with titles and rooms. */
export async function listOwnSessions(memberId: string, from: Date, to: Date): Promise<TimetableSession[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("timetable_sessions")
    .select("uid, starts_at, ends_at, title, location")
    .eq("member_id", memberId)
    .lt("starts_at", to.toISOString())
    .gt("ends_at", from.toISOString())
    .order("starts_at")
    .limit(1000);
  if (error) fail("Reading timetable sessions", error);
  return (data ?? []).map((row) => ({
    uid: row.uid,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    title: row.title,
    location: row.location,
  }));
}

/**
 * Everyone's sessions overlapping [from, to) as bare busy time. Titles and
 * rooms are never selected, so they can't leak into another member's view.
 */
export async function listBusySessions(memberIds: string[], from: Date, to: Date): Promise<BusySession[]> {
  if (memberIds.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("timetable_sessions")
    .select("member_id, starts_at, ends_at")
    .in("member_id", memberIds)
    .lt("starts_at", to.toISOString())
    .gt("ends_at", from.toISOString())
    .order("starts_at")
    .limit(5000);
  if (error) fail("Reading timetable busy time", error);
  return (data ?? []).map((row) => ({ memberId: row.member_id, startsAt: row.starts_at, endsAt: row.ends_at }));
}

/**
 * A London week of timetables as availability blocks: the viewer's own with
 * titles and rooms, everyone else's as busy time only.
 */
export async function timetableBlocksForWeek(
  viewerId: string,
  memberIds: string[],
  week: WeekBounds,
): Promise<AvailabilityBlock[]> {
  const others = memberIds.filter((id) => id !== viewerId);
  const [own, busy] = await Promise.all([
    listOwnSessions(viewerId, week.start, week.end),
    listBusySessions(others, week.start, week.end),
  ]);
  return sessionsToBlocks([...own.map((s) => ({ ...s, memberId: viewerId })), ...busy], week.days);
}
