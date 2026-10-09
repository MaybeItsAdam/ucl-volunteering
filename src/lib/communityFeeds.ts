import { randomBytes } from "node:crypto";
import {
  FEED_ID_PREFIX,
  fetchSocietyList,
  hexColour,
  societyFeedUrl,
  societyRow,
  syncSociety,
  toolboxBase,
} from "@/lib/communityEvents";
import { fetchOrganiserFeed } from "@/lib/toolboxEvents";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * The calendars the committee adds to the public calendar by hand, beside the
 * societies the Toolbox tags `altruism` (see lib/communityEvents).
 *
 * A link to a Toolbox society (its page or its iCal feed) is stored as that
 * society, so the daily sync keeps its name, logo and colours; anything else
 * is stored as a feed of its own under an `ical_…` id.
 *
 * Server only (it holds the service-role client).
 */

export const LABEL_MAX = 80;

/** What a pasted link turned out to be. */
export type FeedSource = { kind: "toolbox"; organiserId: string } | { kind: "ical"; url: string };

/** One calendar on the public calendar, as the committee's list shows it. */
export interface PublicCalendarSource {
  id: string;
  name: string;
  /** Added by the committee, so theirs to take off; else the Toolbox's `altruism` tag brought it. */
  manual: boolean;
  /** The iCal link, or null for a Toolbox society. */
  feedUrl: string | null;
  colour: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  events: number;
}

/** Hosts a server shouldn't be asked to fetch from. */
function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // Any IP literal: a calendar worth adding has a name.
  return /^[\d.]+$/.test(h) || h.includes(":");
}

/**
 * Pure: a pasted link as a feed to add, or the reason it can't be. Takes
 * `webcal://` (what most "subscribe" buttons give) as https.
 */
export function parseFeedLink(input: string, toolbox: string = toolboxBase()): FeedSource | { error: string } {
  const raw = input.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "That isn't a link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Use an https:// or webcal:// link" };
  if (isPrivateHost(url.hostname)) return { error: "That link points somewhere private" };

  const toolboxHost = new URL(toolbox).hostname.replace(/^www\./, "");
  if (url.hostname.replace(/^www\./, "") === toolboxHost) {
    const match = url.pathname.match(/^\/(?:api\/organiser|societies|organisers?)\/([^/]+)(?:\/ical)?\/?$/);
    if (match) return { kind: "toolbox", organiserId: decodeURIComponent(match[1]) };
  }
  url.hash = "";
  return { kind: "ical", url: url.toString() };
}

/** Pure: a label as typed, trimmed, or null for none. */
export function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/\s+/g, " ");
  return v ? v.slice(0, LABEL_MAX) : null;
}

/** Thrown with a message to show the committee. */
export class FeedError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Every calendar on the public calendar, by name, with how many events it has now. */
export async function listPublicCalendarSources(): Promise<PublicCalendarSource[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("community_societies")
    .select("organiser_id, name, label, feed_url, colour, manual, last_synced_at, last_error")
    .eq("included", true)
    .order("name");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const counts = await Promise.all(
    rows.map(async (row) => {
      const { count } = await supabase
        .from("community_events")
        .select("id", { count: "exact", head: true })
        .eq("organiser_id", row.organiser_id);
      return count ?? 0;
    }),
  );
  return rows
    .map((row, i) => ({
      id: row.organiser_id as string,
      name: (row.label || row.name) as string,
      manual: Boolean(row.manual),
      feedUrl: row.feed_url as string | null,
      colour: hexColour(row.colour),
      lastSyncedAt: row.last_synced_at as string | null,
      lastError: row.last_error as string | null,
      events: counts[i],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Fetch a feed once to be sure it's a calendar, with a message fit to show if not. */
async function checkFeed(url: string, name: string): Promise<void> {
  try {
    await fetchOrganiserFeed(url, name);
  } catch (error) {
    const reason = error instanceof Error ? error.message.replace(`${name} feed `, "") : "";
    throw new FeedError(`Couldn't read a calendar from that link${reason ? ` (${reason})` : ""}`, 502);
  }
}

/**
 * Add a calendar and pull its events straight away, so it shows at once. A
 * link that doesn't answer with a calendar is refused rather than stored.
 * Returns the id and how many events came in.
 */
export async function addManualFeed(input: {
  link: string;
  label: string | null;
  colour: string | null;
  memberId: string;
}): Promise<{ id: string; events: number }> {
  const source = parseFeedLink(input.link);
  if ("error" in source) throw new FeedError(source.error);
  const supabase = getSupabaseAdmin();

  if (source.kind === "toolbox") {
    let society;
    try {
      society = (await fetchSocietyList()).find((s) => s.id === source.organiserId);
    } catch {
      throw new FeedError("The Campus Toolbox didn't answer, try again in a minute", 502);
    }
    if (!society) throw new FeedError("The Campus Toolbox doesn't know that society");
    await checkFeed(societyFeedUrl(society.id), society.name);
    const { error } = await supabase.from("community_societies").upsert(
      {
        ...societyRow(society),
        manual: true,
        label: input.label,
        added_by: input.memberId,
        ...(input.colour ? { colour: input.colour, dark_colour: input.colour } : {}),
      },
      { onConflict: "organiser_id" },
    );
    if (error) throw new Error(error.message);
    return { id: society.id, events: await syncSociety({ id: society.id, name: society.name }) };
  }

  if (!input.label) throw new FeedError("Give the calendar a name");
  const { data: existing } = await supabase
    .from("community_societies")
    .select("organiser_id")
    .eq("feed_url", source.url)
    .maybeSingle();
  if (existing) throw new FeedError("That calendar is already on the list");
  await checkFeed(source.url, input.label);

  const id = `${FEED_ID_PREFIX}${randomBytes(6).toString("hex")}`;
  const { error } = await supabase.from("community_societies").insert({
    organiser_id: id,
    name: input.label,
    feed_url: source.url,
    colour: input.colour,
    dark_colour: input.colour,
    manual: true,
    included: true,
    added_by: input.memberId,
  });
  if (error) throw new Error(error.message);
  return { id, events: await syncSociety({ id, name: input.label, feedUrl: source.url }) };
}

/**
 * Take a hand-added calendar off. A feed of its own goes with its events; a
 * Toolbox society stops being kept by hand and its events go, though the
 * next sync brings it back if the Toolbox tags it `altruism`.
 */
export async function removeManualFeed(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("community_societies")
    .select("organiser_id")
    .eq("organiser_id", id)
    .eq("manual", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new FeedError("That calendar isn't on the list", 404);
  if (id.startsWith(FEED_ID_PREFIX)) {
    const { error: deleteError } = await supabase.from("community_societies").delete().eq("organiser_id", id);
    if (deleteError) throw new Error(deleteError.message);
    return;
  }
  const { error: updateError } = await supabase
    .from("community_societies")
    .update({ manual: false, included: false, label: null, added_by: null })
    .eq("organiser_id", id);
  if (updateError) throw new Error(updateError.message);
  const { error: eventsError } = await supabase.from("community_events").delete().eq("organiser_id", id);
  if (eventsError) throw new Error(eventsError.message);
}
