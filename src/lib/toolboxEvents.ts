import { parseIcal, type IcalEvent } from "@/lib/ical";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { EventCategory, EventSource } from "@/lib/types";

/**
 * Two public iCal feeds on Adam's Campus Toolbox, pulled into `events`: UCL
 * Student Social Impact's calendar as `social_impact` rows, and VolSoc's own
 * organiser page as `volsoc_toolbox` rows (including events already run).
 *
 * The feed owns a row's title, time, place, description and link, and every
 * sync rewrites those. The committee owns the rest (category, status, lead,
 * links, notes) and a sync never touches it after the insert. An event that
 * leaves the feed is marked `removed_at` rather than deleted, so what the
 * committee wrote against it survives, and is unmarked if it comes back.
 *
 * The public feed is what the Apps Script read successfully for a year; it
 * needs no token. Toolbox's authenticated v1 API has more (capacity, image),
 * none of which the plan uses.
 */

export const ORGANISER_SYNC_KIND = "organiser_events";
export const DEFAULT_TOOLBOX_URL = "https://www.adamscampustoolbox.org.uk";
/** UCL Student Social Impact, whose events fill the plan. */
export const DEFAULT_CALENDAR_ORGANISER_ID = "org_uni_juev5rp0v";
/** UCL Volunteering Society's own organiser page on the Toolbox. */
export const DEFAULT_VOLSOC_ORGANISER_ID = "org_soc_vol_fix";

/** A Toolbox organiser feed synced into the plan. */
export interface OrganiserFeed {
  source: Exclude<EventSource, "volsoc">;
  /** For messages: "the Social Impact feed returned…". */
  name: string;
  url: string;
  /** New rows start in this category; the committee may change it. */
  category: EventCategory;
}

export function organiserFeeds(env: Record<string, string | undefined> = process.env): OrganiserFeed[] {
  const base = (env.TOOLBOX_URL || DEFAULT_TOOLBOX_URL).replace(/\/+$/, "");
  const url = (id: string) => `${base}/api/organiser/${encodeURIComponent(id)}/ical`;
  return [
    { source: "social_impact", name: "Social Impact", url: organiserFeedUrl(env), category: "ucl_affiliated" },
    {
      source: "volsoc_toolbox",
      name: "VolSoc",
      url: url(env.TOOLBOX_ORGANISER_ID || DEFAULT_VOLSOC_ORGANISER_ID),
      category: "volunteering",
    },
  ];
}

/** An event the feed gave no end is shown as an hour long. */
const DEFAULT_LENGTH_MS = 60 * 60_000;

export function organiserFeedUrl(env: Record<string, string | undefined> = process.env): string {
  const base = (env.TOOLBOX_URL || DEFAULT_TOOLBOX_URL).replace(/\/+$/, "");
  const id = env.CALENDAR_ORGANISER_ID || DEFAULT_CALENDAR_ORGANISER_ID;
  return `${base}/api/organiser/${encodeURIComponent(id)}/ical`;
}

/** http(s) only: these land in an href. */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The feed-owned columns of a row, as the feed has them now. */
export interface FeedFields {
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  url: string | null;
}

export const FEED_FIELDS = ["title", "starts_at", "ends_at", "all_day", "location", "description", "url"] as const;

export function feedFields(event: IcalEvent): FeedFields {
  const end = event.end ?? new Date(event.start.getTime() + DEFAULT_LENGTH_MS);
  return {
    title: event.title.trim() || "Untitled event",
    starts_at: event.start.toISOString(),
    ends_at: end.toISOString(),
    all_day: event.allDay,
    location: event.location,
    description: event.description,
    url: safeUrl(event.url),
  };
}

/** What the sync needs to know about a feed row already stored. */
export interface ExistingFeedRow extends FeedFields {
  id: string;
  toolbox_uid: string;
  status: string;
  removed_at: string | null;
}

export interface FeedSyncPlan {
  inserts: Record<string, unknown>[];
  updates: { id: string; uid: string; changes: Record<string, unknown> }[];
  /** Row ids to mark removed. */
  remove: string[];
  unchanged: number;
  /** UIDs that appeared more than once in the feed (the last one wins). */
  duplicates: string[];
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

function changedFields(existing: ExistingFeedRow, next: FeedFields): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const key of FEED_FIELDS) {
    const same =
      key === "starts_at" || key === "ends_at"
        ? sameInstant(existing[key], next[key])
        : (existing[key] ?? null) === (next[key] ?? null);
    if (!same) changes[key] = next[key];
  }
  return changes;
}

/**
 * Pure: what to write to bring the stored rows in line with a feed.
 *
 * Never call this with an empty feed: an empty feed is far likelier to be a
 * Toolbox fault than Social Impact cancelling everything, and the caller
 * refuses it before getting here. Even so, the plan for an empty feed removes
 * nothing.
 *
 * Only rows starting on or after the earlier of `now` and the feed's first
 * event are candidates for removal: the feed carries a window of dates, so an
 * event from last month that has aged out of it was not withdrawn.
 */
export function planFeedSync(
  feed: IcalEvent[],
  existing: ExistingFeedRow[],
  now: Date,
  target: Pick<OrganiserFeed, "source" | "category"> = { source: "social_impact", category: "ucl_affiliated" },
): FeedSyncPlan {
  const byUid = new Map<string, IcalEvent>();
  const duplicates = new Set<string>();
  for (const event of feed) {
    if (byUid.has(event.uid)) duplicates.add(event.uid);
    byUid.set(event.uid, event);
  }
  const stored = new Map(existing.map((row) => [row.toolbox_uid, row]));

  const plan: FeedSyncPlan = { inserts: [], updates: [], remove: [], unchanged: 0, duplicates: [...duplicates] };

  for (const [uid, event] of byUid) {
    const fields = feedFields(event);
    const row = stored.get(uid);
    if (!row) {
      plan.inserts.push({
        source: target.source,
        category: target.category,
        toolbox_uid: uid,
        status: event.cancelled ? "cancelled" : "provisional",
        ...fields,
      });
      continue;
    }
    const changes = changedFields(row, fields);
    if (row.removed_at) changes.removed_at = null;
    // Status is the committee's, except that a cancellation in the feed is a
    // fact they need to see.
    if (event.cancelled && row.status !== "cancelled") changes.status = "cancelled";
    if (Object.keys(changes).length) plan.updates.push({ id: row.id, uid, changes });
    else plan.unchanged += 1;
  }

  if (byUid.size) {
    const earliestFeed = Math.min(...[...byUid.values()].map((e) => e.start.getTime()));
    const horizon = Math.min(now.getTime(), earliestFeed);
    for (const row of existing) {
      if (byUid.has(row.toolbox_uid) || row.removed_at) continue;
      if (new Date(row.starts_at).getTime() >= horizon) plan.remove.push(row.id);
    }
  }

  return plan;
}

/** GET the feed and parse it. Throws on HTTP failure or a body that isn't a calendar. */
export async function fetchOrganiserFeed(url: string = organiserFeedUrl(), name = "Social Impact"): Promise<IcalEvent[]> {
  const res = await fetch(url, {
    headers: { Accept: "text/calendar" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${name} feed returned HTTP ${res.status}`);
  const body = await res.text();
  if (!body.includes("BEGIN:VCALENDAR")) throw new Error(`${name} feed did not return a calendar`);
  return parseIcal(body);
}

export interface FeedSyncSummary {
  feedEvents: number;
  inserted: number;
  updated: number;
  removed: number;
  restored: number;
  unchanged: number;
  duplicates: string[];
}

/** Totals across the feeds, plus each feed's own counts. */
export interface OrganiserSyncSummary extends FeedSyncSummary {
  feeds: Partial<Record<OrganiserFeed["source"], FeedSyncSummary>>;
}

export type OrganiserSyncResult =
  | { ok: true; runId: string | null; summary: OrganiserSyncSummary }
  | { ok: false; runId: string | null; error: string; summary?: OrganiserSyncSummary };

/** Fetch one feed and bring its rows in line. Throws on any failure. */
async function syncFeed(feed: OrganiserFeed, now: Date): Promise<FeedSyncSummary> {
  const supabase = getSupabaseAdmin();
  const events = await fetchOrganiserFeed(feed.url, feed.name);
  if (!events.length) throw new Error(`${feed.name} feed was empty; nothing was changed`);

  const { data: existing, error } = await supabase
    .from("events")
    .select("id, toolbox_uid, status, removed_at, " + FEED_FIELDS.join(", "))
    .eq("source", feed.source)
    .not("toolbox_uid", "is", null);
  if (error) throw new Error(`Database error: ${error.message}`);

  const plan = planFeedSync(events, (existing ?? []) as unknown as ExistingFeedRow[], now, feed);

  if (plan.inserts.length) {
    const { error: insertError } = await supabase.from("events").insert(plan.inserts);
    if (insertError) throw new Error(`Database error: ${insertError.message}`);
  }
  for (const update of plan.updates) {
    const { error: updateError } = await supabase.from("events").update(update.changes).eq("id", update.id);
    if (updateError) throw new Error(`Database error on ${update.uid}: ${updateError.message}`);
  }
  if (plan.remove.length) {
    const { error: removeError } = await supabase
      .from("events")
      .update({ removed_at: new Date().toISOString() })
      .in("id", plan.remove);
    if (removeError) throw new Error(`Database error: ${removeError.message}`);
  }

  return {
    feedEvents: events.length,
    inserted: plan.inserts.length,
    updated: plan.updates.length,
    removed: plan.remove.length,
    restored: plan.updates.filter((u) => "removed_at" in u.changes).length,
    unchanged: plan.unchanged,
    duplicates: plan.duplicates,
  };
}

/**
 * Sync every organiser feed and record the run in `sync_runs`. One feed
 * failing doesn't stop the other; the run is ok only if both were.
 * Never throws: a failure is returned and recorded.
 */
export async function runOrganiserSync(
  options: { feeds?: OrganiserFeed[]; now?: Date } = {},
): Promise<OrganiserSyncResult> {
  const supabase = getSupabaseAdmin();
  const { data: run, error: runError } = await supabase
    .from("sync_runs")
    .insert({ kind: ORGANISER_SYNC_KIND })
    .select("id")
    .single();
  if (runError) console.error(`[sync] could not record the start of an organiser sync: ${runError.message}`);
  const runId = (run?.id as string | undefined) ?? null;

  const finish = async (result: { ok: boolean; summary?: OrganiserSyncSummary; error?: string }) => {
    if (!runId) return;
    const { error } = await supabase
      .from("sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: result.ok,
        summary: result.summary ?? {},
        error: result.error ?? null,
      })
      .eq("id", runId);
    if (error) console.error(`[sync] could not record the end of organiser sync ${runId}: ${error.message}`);
  };

  const now = options.now ?? new Date();
  const summary: OrganiserSyncSummary = {
    feedEvents: 0, inserted: 0, updated: 0, removed: 0, restored: 0, unchanged: 0, duplicates: [], feeds: {},
  };
  const errors: string[] = [];
  for (const feed of options.feeds ?? organiserFeeds()) {
    try {
      const counts = await syncFeed(feed, now);
      summary.feeds[feed.source] = counts;
      summary.feedEvents += counts.feedEvents;
      summary.inserted += counts.inserted;
      summary.updated += counts.updated;
      summary.removed += counts.removed;
      summary.restored += counts.restored;
      summary.unchanged += counts.unchanged;
      summary.duplicates.push(...counts.duplicates);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${feed.name} sync failed`);
    }
  }

  if (errors.length) {
    const error = errors.join("; ");
    await finish({ ok: false, summary, error });
    return { ok: false, runId, error, summary };
  }
  await finish({ ok: true, summary });
  return { ok: true, runId, summary };
}

/** The latest organiser sync run, for a "last synced" line. */
export async function lastOrganiserSync(): Promise<{
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  summary: Record<string, unknown>;
  error: string | null;
} | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("sync_runs")
    .select("started_at, finished_at, ok, summary, error")
    .eq("kind", ORGANISER_SYNC_KIND)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    ok: data.ok,
    summary: (data.summary ?? {}) as Record<string, unknown>,
    error: data.error,
  };
}
