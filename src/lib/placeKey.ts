/** Pure place helpers, safe for the browser; the lookups and the cache are in places.ts. */

export interface Point {
  lat: number;
  lng: number;
}

export const MAX_PLACE_QUERY = 200;

/** The cache key for location text: lower case, single spaces, trimmed. */
export function placeKey(text: string | null | undefined): string | null {
  const key = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, MAX_PLACE_QUERY);
  return key.length >= 3 ? key : null;
}
