import { isDayKey } from "@/lib/planTime";

/**
 * The Zero Food Waste log (/zero-food-waste): one row per outlet per shift,
 * appended to the team's Google Sheet by the Apps Script in
 * apps-script/zero-food-waste. The sheet stays the record; nothing is kept here.
 *
 * Each count's `header` is the first line of its column heading in the sheet,
 * which is how the script finds the column, so moving columns around in the
 * sheet is fine but renaming one means changing it here too.
 */

export const ZFW_SHEET_URL = "https://docs.google.com/spreadsheets/d/1u3fxsT_OfxwZd7-lYAkhgMWsUutjx5O9jpMORYxHvM8/edit";

/** The collection round, spelt as the sheet already has them. */
export const OUTLETS = [
  "Bentham House Cafe",
  "Brew Bar",
  "Cafe on the Quad",
  "Cruciform Cafe",
  "Engineering Cafe",
  "Housman",
  "IOE Cafe",
  "North Observatory",
  "Science Library Cafe",
  "Smashed it!",
  "Street Slice",
  "Student Centre Cafe",
  "Sundae Society",
  "Wilkins Refectory",
  "Wills Cafe",
] as const;

export const COUNTS = [
  { key: "main", header: "Main", label: "Mains", hint: "Sandwiches, wraps, tosties, rice and salad bowls, large sushi" },
  { key: "pots", header: "Fruit pots & Yogurt pots", label: "Fruit and yoghurt pots", hint: null },
  { key: "pastries", header: "Pastries / Pasties", label: "Pastries and pasties", hint: null },
  { key: "baked", header: "Other baked goods", label: "Other baked goods", hint: "Cake slices, brownies, flapjacks" },
  { key: "snacks", header: "Snacks", label: "Snacks", hint: "Crisps, snack bites, gyoza, small sushi" },
  { key: "fruit", header: "Fruit", label: "Fruit", hint: null },
  { key: "others", header: "Others", label: "Anything else", hint: "Bags of onions, milk cartons" },
] as const;

export type CountKey = (typeof COUNTS)[number]["key"];

export interface ZfwEntry {
  /** A London day, YYYY-MM-DD. */
  date: string;
  outlet: string;
  /** Who was on the shift, as typed, each once. */
  people: string[];
  counts: Record<CountKey, number>;
  total: number;
  incentives: number | null;
}

/** What the Apps Script is sent: the sheet's column headings and their values. */
export interface ZfwRow {
  date: string;
  values: Record<string, string | number>;
}

const MAX_COUNT = 2000;
export const MAX_PEOPLE = 12;

/** Names as typed, trimmed, blank ones dropped, each once (ignoring case), in order. */
export function cleanPeople(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  const people: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    people.push(name);
  }
  return people.slice(0, MAX_PEOPLE);
}

function count(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(n) && n >= 0 && n <= MAX_COUNT ? n : null;
}

/** A shift from the form, cleaned, or what's wrong with it. */
export function parseZfwEntry(body: unknown, today: string): { value: ZfwEntry; error?: undefined } | { value?: undefined; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const date = typeof b.date === "string" ? b.date : "";
  const outlet = typeof b.outlet === "string" ? b.outlet.trim().slice(0, 80) : "";
  const people = cleanPeople(b.people);

  if (!isDayKey(date)) return { error: "Pick the date of the shift" };
  if (date > today) return { error: "That date hasn't happened yet" };
  if (!outlet) return { error: "Pick the outlet" };
  if (!people.length) return { error: "Add who was on the shift" };

  const raw = (b.counts && typeof b.counts === "object" ? b.counts : {}) as Record<string, unknown>;
  const counts = {} as Record<CountKey, number>;
  for (const { key, label } of COUNTS) {
    const n = count(raw[key]);
    if (n === null) return { error: `${label} should be a whole number` };
    counts[key] = n;
  }
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  if (total === 0) return { error: "Add at least one item collected" };

  let incentives: number | null = null;
  if (b.incentives !== "" && b.incentives !== undefined && b.incentives !== null) {
    incentives = count(b.incentives);
    if (incentives === null) return { error: "Incentives should be a whole number" };
  }

  return { value: { date, outlet, people, counts, total, incentives } };
}

/**
 * The entry as the sheet's columns. Blank counts stay blank, as the team
 * writes them. Everyone on the shift goes in the sheet's "Shift Leader"
 * column, comma-separated, which keeps the team's existing column.
 */
export function toZfwRow(entry: ZfwEntry): ZfwRow {
  const values: Record<string, string | number> = { Outlet: entry.outlet, "Shift Leader": entry.people.join(", "), Total: entry.total };
  for (const { key, header } of COUNTS) values[header] = entry.counts[key] || "";
  values.Incentives = entry.incentives ?? "";
  return { date: entry.date, values };
}
