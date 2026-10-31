import { MAX_PLACE_QUERY as MAX_QUERY, placeKey, type Point } from "@/lib/placeKey";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Coordinates for location text, for the map beside /timetable.
 *
 * Looked up once and kept in `places`: a postcode in the text goes to
 * postcodes.io; a UCL building we know by name is placed from the list below;
 * anything else goes to OpenStreetMap's Nominatim, bounded to London, at most
 * one request a second as its usage policy asks. Online events get no pin.
 */

export { placeKey, type Point } from "@/lib/placeKey";

const RETRY_AFTER_DAYS = 30;

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})\b/i;

export function extractPostcode(text: string): string | null {
  const m = text.match(POSTCODE);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

/** Text that means "no place to pin": online, TBC and the like. */
export function isPlaceless(text: string): boolean {
  return /\b(online|zoom|teams|virtual|remote|google meet|tbc|tba|tbd|to be (confirmed|decided|announced)|various|see description)\b/i.test(text);
}

/**
 * UCL's buildings that events name without an address, placed by hand (the
 * building's entrance, near enough for a map of London). Checked in order, so
 * the specific names come before "UCL" alone.
 */
export const KNOWN_PLACES: { match: RegExp; point: Point }[] = [
  { match: /student cent(re|er)/i, point: { lat: 51.5253, lng: -0.1326 } },
  { match: /bloomsbury theatre/i, point: { lat: 51.5249, lng: -0.1323 } },
  { match: /cruciform/i, point: { lat: 51.5242, lng: -0.135 } },
  { match: /\bioe\b|institute of education|20 bedford way/i, point: { lat: 51.5225, lng: -0.1296 } },
  { match: /foster court|malet place/i, point: { lat: 51.5234, lng: -0.1328 } },
  { match: /bentham house/i, point: { lat: 51.5262, lng: -0.1311 } },
  { match: /ucl east|marshgate|one pool street/i, point: { lat: 51.5395, lng: -0.0138 } },
  { match: /wilkins|main quad|north cloisters|south cloisters|gustave tuck|darwin (building|lecture)|\bjz young\b|chadwick|roberts building|pearson building|medawar/i, point: { lat: 51.5246, lng: -0.134 } },
  { match: /\bucl\b|gower st(reet)?|students'? union ucl|\bsu ucl\b/i, point: { lat: 51.5246, lng: -0.134 } },
];

export function knownPlace(text: string): Point | null {
  return KNOWN_PLACES.find((p) => p.match.test(text))?.point ?? null;
}

type Lookup = Point & { source: string };

async function byPostcode(postcode: string, fetchImpl: typeof fetch): Promise<Lookup | null> {
  const res = await fetchImpl(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const { result } = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
  return result?.latitude != null && result.longitude != null ? { lat: result.latitude, lng: result.longitude, source: "postcode" } : null;
}

async function byNominatim(text: string, fetchImpl: typeof fetch): Promise<Lookup | null> {
  // Greater London's box, so "Library" doesn't land in Leeds.
  const params = new URLSearchParams({ q: text, format: "jsonv2", limit: "1", countrycodes: "gb", viewbox: "-0.51,51.69,0.33,51.28", bounded: "1" });
  const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "UCLVolunteeringSociety/1.0 (+https://uclvolunteering.org)", "Accept-Language": "en-GB" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), source: "nominatim" } : null;
}

/** Where one location's text is, without the cache. Null when nothing could say. */
export async function lookUp(text: string, fetchImpl: typeof fetch = fetch): Promise<Lookup | null> {
  if (isPlaceless(text)) return null;
  const postcode = extractPostcode(text);
  if (postcode) {
    const hit = await byPostcode(postcode, fetchImpl).catch(() => null);
    if (hit) return hit;
  }
  const known = knownPlace(text);
  if (known) return { ...known, source: "known" };
  return byNominatim(text, fetchImpl).catch(() => null);
}

/** Coordinates already looked up for these location texts, by `placeKey`. Never fetches. */
export async function cachedPlaces(texts: (string | null | undefined)[]): Promise<Record<string, Point>> {
  const keys = [...new Set(texts.map(placeKey).filter((k): k is string => k !== null))];
  if (!keys.length || !isSupabaseConfigured()) return {};
  const out: Record<string, Point> = {};
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await getSupabaseAdmin().from("places").select("query,lat,lng").in("query", keys.slice(i, i + 200)).not("lat", "is", null);
    if (error) throw new Error(`places: ${error.message}`);
    for (const row of data ?? []) out[row.query as string] = { lat: row.lat as number, lng: row.lng as number };
  }
  // A UCL building we know by name needs no lookup, so it pins even when the
  // cache holds an older miss for that text (misses wait a month to retry).
  for (const key of keys) {
    if (out[key] || isPlaceless(key)) continue;
    const known = knownPlace(key);
    if (known) out[key] = known;
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Look up the texts not yet in the cache (or that missed over a month ago),
 * at most `limit` per call, a second apart, and keep the answers, misses
 * included. Returns how many were looked up. Best effort: a failure is logged.
 */
export async function fillPlaces(texts: (string | null | undefined)[], { limit = 40, fetchImpl = fetch }: { limit?: number; fetchImpl?: typeof fetch } = {}): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const byKey = new Map<string, string>();
  for (const t of texts) {
    const key = placeKey(t);
    if (key && !byKey.has(key)) byKey.set(key, t!.trim().slice(0, MAX_QUERY));
  }
  if (!byKey.size) return 0;
  const supabase = getSupabaseAdmin();
  const retryBefore = new Date(Date.now() - RETRY_AFTER_DAYS * 86_400_000).toISOString();
  const known = new Set<string>();
  const keys = [...byKey.keys()];
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await supabase.from("places").select("query,lat,looked_up_at").in("query", keys.slice(i, i + 200));
    if (error) {
      console.error(`[places] couldn't read the cache: ${error.message}`);
      return 0;
    }
    for (const row of data ?? []) if (row.lat !== null || (row.looked_up_at as string) > retryBefore) known.add(row.query as string);
  }

  const todo = keys.filter((k) => !known.has(k)).slice(0, limit);
  let looked = 0;
  for (const key of todo) {
    const text = byKey.get(key)!;
    const usesNominatim = !isPlaceless(text) && !knownPlace(text);
    const hit = await lookUp(text, fetchImpl);
    const { error } = await supabase
      .from("places")
      .upsert({ query: key, lat: hit?.lat ?? null, lng: hit?.lng ?? null, source: hit?.source ?? "none", looked_up_at: new Date().toISOString() });
    if (error) console.error(`[places] couldn't keep "${key}": ${error.message}`);
    looked++;
    if (usesNominatim) await sleep(1100);
  }
  return looked;
}
