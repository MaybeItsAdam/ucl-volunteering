import type { IcalEvent } from "@/lib/ical";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_CALENDAR_ORGANISER_ID,
  DEFAULT_TOOLBOX_URL,
  DEFAULT_VOLSOC_ORGANISER_ID,
  feedFields, fetchOrganiserFeed, safeUrl } from "@/lib/toolboxEvents";

/**
 * What's on: upcoming events from the SU's social impact societies, for
 * everyone signed in.
 *
 * The societies are the Toolbox societies tagged `altruism` (the SU's own
 * grouping: Street Aid, Red Cross, Cancer Charities Alliance, …) plus VolSoc
 * and UCL Student Social Impact.
 * Once a day each one's public iCal feed is pulled into `community_events`.
 * The feed owns every column, so a society's rows are replaced wholesale. A
 * feed that fails keeps its old rows and records the error on the society; a
 * feed that answers with no events clears them, since an empty calendar is an
 * ordinary thing for a society to have.
 *
 * Server only (it holds the service-role client).
 */

export const COMMUNITY_SYNC_KIND = "community_events";
/** The SU's tag for social impact societies on the Toolbox. */
export const COMMUNITY_TAG = "altruism";
/** Events are kept from a day ago, so one running now still shows, to this far ahead. */
export const WINDOW_PAST_MS = 24 * 60 * 60_000;
export const WINDOW_AHEAD_DAYS = 60;
export const DESCRIPTION_LIMIT = 600;
/** Feeds fetched at once. */
const CONCURRENCY = 4;

export function toolboxBase(env: Record<string, string | undefined> = process.env): string {
  return (env.TOOLBOX_URL || DEFAULT_TOOLBOX_URL).replace(/\/+$/, "");
}

export function societyFeedUrl(organiserId: string, env: Record<string, string | undefined> = process.env): string {
  return `${toolboxBase(env)}/api/organiser/${encodeURIComponent(organiserId)}/ical`;
}

/** The society's page on the Toolbox, for an event with no link of its own. */
export function societyPageUrl(organiserId: string, env: Record<string, string | undefined> = process.env): string {
  return `${toolboxBase(env)}/societies/${encodeURIComponent(organiserId)}`;
}

/** A society as the Toolbox lists it, after validation. */
export interface ToolboxSociety {
  id: string;
  name: string;
  logoUrl: string | null;
  colour: string | null;
  darkColour: string | null;
  unionUrl: string | null;
  tags: string[];
}

/** A row of `community_societies`, as the sync writes it. */
export interface SocietyRow {
  organiser_id: string;
  name: string;
  logo_url: string | null;
  colour: string | null;
  dark_colour: string | null;
  union_url: string | null;
  included: boolean;
}

/** A row of `community_events`, as `replace_community_events` takes it. */
export interface CommunityEventRow {
  uid: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  url: string | null;
  description: string | null;
  cancelled: boolean;
}

/** `#abc123` in lower case, or null: these land in a style attribute. */
export function hexColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/**
 * Pure: the Toolbox's `/api/societies` body as a list. Entries without an id
 * or name are dropped. Throws if the body isn't the list at all.
 */
export function parseSocietyList(body: unknown): ToolboxSociety[] {
  const list = Array.isArray(body) ? body : (body as { societies?: unknown } | null)?.societies;
  if (!Array.isArray(list)) throw new Error("The Toolbox society list was not a list");
  const societies: ToolboxSociety[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const id = typeof s.id === "string" ? s.id.trim() : "";
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!id || !name) continue;
    societies.push({
      id,
      name,
      logoUrl: safeUrl(typeof s.logoUrl === "string" ? s.logoUrl : null),
      colour: hexColour(s.color),
      darkColour: hexColour(s.darkColor),
      unionUrl: safeUrl(typeof s.unionUrl === "string" ? s.unionUrl : null),
      tags: Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === "string") : [],
    });
  }
  return societies;
}

/**
 * Pure: the societies What's on follows — every one tagged `altruism`, plus
 * VolSoc and Student Social Impact (`always`) whatever their tags — by name. Throws if none is tagged, which means the
 * Toolbox's tagging broke rather than that every society left.
 */
export function selectCommunitySocieties(
  all: ToolboxSociety[],
  always: readonly string[] = [DEFAULT_VOLSOC_ORGANISER_ID, DEFAULT_CALENDAR_ORGANISER_ID],
): ToolboxSociety[] {
  const chosen = new Map<string, ToolboxSociety>();
  for (const s of all) if (s.tags.includes(COMMUNITY_TAG) || always.includes(s.id)) chosen.set(s.id, s);
  if (![...chosen.values()].some((s) => s.tags.includes(COMMUNITY_TAG))) {
    throw new Error(`No Toolbox society is tagged ${COMMUNITY_TAG}`);
  }
  return [...chosen.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export function societyRow(s: ToolboxSociety): SocietyRow {
  return {
    organiser_id: s.id,
    name: s.name,
    logo_url: s.logoUrl,
    colour: s.colour,
    dark_colour: s.darkColour ?? s.colour,
    union_url: s.unionUrl,
    included: true,
  };
}

function clip(text: string | null, limit: number = DESCRIPTION_LIMIT): string | null {
  if (!text) return null;
  const t = text.trim();
  if (t.length <= limit) return t || null;
  return `${t.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * Pure: the rows to store for one feed. Keeps events that end after a day ago
 * and start within the window, one per UID (the last wins), soonest first.
 */
export function planSocietyEvents(feed: IcalEvent[], now: Date): CommunityEventRow[] {
  const from = now.getTime() - WINDOW_PAST_MS;
  const to = now.getTime() + WINDOW_AHEAD_DAYS * 24 * 60 * 60_000;
  const byUid = new Map<string, CommunityEventRow>();
  for (const event of feed) {
    const fields = feedFields(event);
    if (Date.parse(fields.ends_at) < from || event.start.getTime() > to) continue;
    byUid.set(event.uid, {
      uid: event.uid,
      title: fields.title,
      starts_at: fields.starts_at,
      ends_at: fields.ends_at,
      all_day: fields.all_day,
      location: fields.location,
      url: fields.url,
      description: clip(fields.description),
      cancelled: event.cancelled,
    });
  }
  return [...byUid.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** `fn` over `items`, at most `limit` at a time, results in input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** GET the Toolbox society list. Throws on HTTP failure or a body that isn't the list. */
export async function fetchSocietyList(env: Record<string, string | undefined> = process.env): Promise<ToolboxSociety[]> {
  const res = await fetch(`${toolboxBase(env)}/api/societies`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`The Toolbox society list returned HTTP ${res.status}`);
  return parseSocietyList(await res.json());
}

export interface CommunitySyncSummary {
  societies: number;
  feedsOk: number;
  feedsFailed: number;
  events: number;
  /** True when the society list couldn't be read and the last known list was used. */
  usedStoredList: boolean;
}

export type CommunitySyncResult =
  | { ok: true; runId: string | null; summary: CommunitySyncSummary }
  | { ok: false; runId: string | null; error: string; summary: CommunitySyncSummary };

/**
 * Refresh the society list, then every society's events, and record the run in
 * `sync_runs`. If the list can't be read, the societies already stored are
 * synced instead. Never throws: a failure is returned and recorded.
 */
export async function runCommunitySync(options: { now?: Date } = {}): Promise<CommunitySyncResult> {
  const supabase = getSupabaseAdmin();
  const now = options.now ?? new Date();
  const { data: run, error: runError } = await supabase
    .from("sync_runs")
    .insert({ kind: COMMUNITY_SYNC_KIND })
    .select("id")
    .single();
  if (runError) console.error(`[sync] could not record the start of a community sync: ${runError.message}`);
  const runId = (run?.id as string | undefined) ?? null;

  const summary: CommunitySyncSummary = { societies: 0, feedsOk: 0, feedsFailed: 0, events: 0, usedStoredList: false };
  const errors: string[] = [];

  const finish = async (): Promise<CommunitySyncResult> => {
    const error = errors.length ? errors.join("; ") : null;
    if (runId) {
      const { error: updateError } = await supabase
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: !error, summary, error })
        .eq("id", runId);
      if (updateError) console.error(`[sync] could not record the end of community sync ${runId}: ${updateError.message}`);
    }
    return error ? { ok: false, runId, error, summary } : { ok: true, runId, summary };
  };

  // Who to sync: the Toolbox's list now, or failing that the last one stored.
  let societies: { id: string; name: string }[];
  try {
    const chosen = selectCommunitySocieties(await fetchSocietyList(), [
      process.env.TOOLBOX_ORGANISER_ID || DEFAULT_VOLSOC_ORGANISER_ID,
      process.env.CALENDAR_ORGANISER_ID || DEFAULT_CALENDAR_ORGANISER_ID,
    ]);
    const { error: upsertError } = await supabase
      .from("community_societies")
      .upsert(chosen.map(societyRow), { onConflict: "organiser_id" });
    if (upsertError) throw new Error(`Database error: ${upsertError.message}`);
    const { data: stored, error: storedError } = await supabase
      .from("community_societies")
      .select("organiser_id")
      .eq("included", true);
    if (storedError) throw new Error(`Database error: ${storedError.message}`);
    const keep = new Set(chosen.map((s) => s.id));
    const dropped = (stored ?? []).map((row) => row.organiser_id as string).filter((id) => !keep.has(id));
    if (dropped.length) {
      const { error: dropError } = await supabase
        .from("community_societies")
        .update({ included: false })
        .in("organiser_id", dropped);
      if (dropError) throw new Error(`Database error: ${dropError.message}`);
    }
    societies = chosen;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "The Toolbox society list couldn't be read");
    const { data, error: readError } = await supabase
      .from("community_societies")
      .select("organiser_id, name")
      .eq("included", true);
    if (readError || !data?.length) return finish();
    summary.usedStoredList = true;
    societies = data.map((row) => ({ id: row.organiser_id as string, name: row.name as string }));
  }
  summary.societies = societies.length;

  await mapWithConcurrency(societies, CONCURRENCY, async (society) => {
    try {
      const rows = planSocietyEvents(await fetchOrganiserFeed(societyFeedUrl(society.id), society.name), now);
      const { data, error } = await supabase.rpc("replace_community_events", {
        p_organiser_id: society.id,
        p_events: rows,
      });
      if (error) throw new Error(`Database error: ${error.message}`);
      summary.feedsOk += 1;
      summary.events += typeof data === "number" ? data : rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : `${society.name} sync failed`;
      summary.feedsFailed += 1;
      errors.push(message);
      const { error: markError } = await supabase
        .from("community_societies")
        .update({ last_error: message })
        .eq("organiser_id", society.id);
      if (markError) console.error(`[sync] could not record ${society.name}'s error: ${markError.message}`);
    }
  });

  return finish();
}

/** A society on the What's on page. */
export interface CommunitySociety {
  id: string;
  name: string;
  logoUrl: string | null;
  colour: string | null;
  darkColour: string | null;
}

/** An event on the What's on page. */
export interface CommunityEvent {
  id: string;
  societyId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  /** The event's own page, or its society's on the Toolbox. */
  url: string;
  cancelled: boolean;
}

/** Included societies, and their events that haven't ended by `now`, soonest first. Throws on a database error. */
export async function listCommunityEvents(now: Date = new Date()): Promise<{
  societies: CommunitySociety[];
  events: CommunityEvent[];
}> {
  const supabase = getSupabaseAdmin();
  const { data: societyRows, error: societyError } = await supabase
    .from("community_societies")
    .select("organiser_id, name, logo_url, colour, dark_colour")
    .eq("included", true)
    .order("name");
  if (societyError) throw new Error(societyError.message);
  const societies: CommunitySociety[] = (societyRows ?? []).map((row) => ({
    id: row.organiser_id,
    name: row.name,
    logoUrl: safeUrl(row.logo_url),
    colour: hexColour(row.colour),
    darkColour: hexColour(row.dark_colour),
  }));
  if (!societies.length) return { societies, events: [] };

  const { data: eventRows, error: eventError } = await supabase
    .from("community_events")
    .select("id, organiser_id, title, starts_at, ends_at, all_day, location, url, cancelled")
    .in("organiser_id", societies.map((s) => s.id))
    .gte("ends_at", now.toISOString())
    .order("starts_at")
    .limit(1000);
  if (eventError) throw new Error(eventError.message);
  const events: CommunityEvent[] = (eventRows ?? []).map((row) => ({
    id: row.id,
    societyId: row.organiser_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    location: row.location,
    url: safeUrl(row.url) ?? societyPageUrl(row.organiser_id),
    cancelled: row.cancelled,
  }));
  return { societies, events };
}

/** When What's on was last refreshed successfully, or null. */
export async function lastCommunitySync(): Promise<{ at: string; ok: boolean | null } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("sync_runs")
    .select("started_at, finished_at, ok")
    .eq("kind", COMMUNITY_SYNC_KIND)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { at: data.finished_at ?? data.started_at, ok: data.ok };
}
