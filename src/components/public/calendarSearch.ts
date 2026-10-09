/** The public calendar's search. Pure. */

/** Lower case with the accents off, so "cafe" finds "Café". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

interface Searchable {
  title: string;
  location: string | null;
  description: string | null;
}

/**
 * Whether an event matches every word of the query, in its title, host,
 * place or description. An empty query matches everything.
 */
export function matchesQuery(event: Searchable, host: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold([event.title, host, event.location ?? "", event.description ?? ""].join(" "));
  return words.every((w) => haystack.includes(w));
}
