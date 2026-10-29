import { generateText, Output } from "ai";
import { z } from "zod";
import { CAUSES, COMMITMENT_KINDS, DBS_OPTIONS, parseSessions, SIGNUP_METHODS } from "@/lib/directory";

/**
 * Autofill for the directory editor: read an organisation's volunteering page
 * (or text the committee pasted) and pull out the practical details. The
 * model only copies what the page states; anything it can't find stays empty
 * for the committee to fill, and every field it did fill is marked for them
 * to check before saving.
 */

/** Any AI Gateway model with structured output; cheap and quick is right for extraction. */
const MODEL = process.env.DIRECTORY_AUTOFILL_MODEL || "anthropic/claude-haiku-5.5";

const keys = <T extends readonly { key: string }[]>(options: T) => options.map((o) => o.key) as [T[number]["key"], ...T[number]["key"][]];

const schema = z.object({
  organisation: z.string().nullable().describe("The organisation's name"),
  orgUrl: z.string().nullable().describe("The organisation's main website, absolute https URL"),
  title: z.string().nullable().describe("The volunteer role's name, e.g. 'Kitchen volunteer'"),
  summary: z.string().nullable().describe("One plain sentence, under 160 characters, saying what a volunteer actually does"),
  description: z.string().nullable().describe("A short paragraph about the role, from the page, under 800 characters"),
  causes: z.array(z.enum(keys(CAUSES))).describe("Causes the role clearly serves; empty if unclear"),
  commitment: z.enum(keys(COMMITMENT_KINDS)).nullable().describe("drop_in: turn up to sessions without signing up first. one_off: a single day or event. regular: a fixed weekly or fortnightly slot. flexible: times agreed with them."),
  timeNeeded: z.string().nullable().describe("Time asked of volunteers in words, e.g. '3 hours a week' or 'One Saturday morning'"),
  signupMethod: z.enum(keys(SIGNUP_METHODS)).nullable().describe("How a new volunteer starts"),
  signupUrl: z.string().nullable().describe("The absolute URL of the sign-up or application form, if the page links one"),
  signupEmail: z.string().nullable().describe("The email address to write to in order to volunteer"),
  signupSteps: z.string().nullable().describe("What happens after getting in touch, as stated: interview, induction, training session, references. Under 400 characters"),
  sessions: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7).describe("ISO weekday, Monday = 1"),
        start: z.string().describe("24-hour HH:MM"),
        end: z.string().describe("24-hour HH:MM"),
        where: z.string().nullable(),
        note: z.string().nullable().describe("e.g. 'Term time only'"),
      }),
    )
    .describe("Regular weekly session or drop-in times stated on the page; empty if none are stated"),
  address: z.string().nullable().describe("Street address where volunteering happens, without the postcode"),
  postcode: z.string().nullable().describe("UK postcode of that address"),
  remote: z.boolean().nullable().describe("True only if the page says it can be done remotely or online"),
  minAge: z.number().int().nullable().describe("Minimum volunteer age if stated"),
  dbs: z.enum(keys(DBS_OPTIONS)).nullable().describe("not_needed only if the page says no DBS/background check is needed; provided if a DBS is needed and they arrange or pay for it; needed if a DBS is required otherwise; null if not mentioned"),
  expensesPaid: z.boolean().nullable().describe("True if travel or other expenses are reimbursed"),
  training: z.string().nullable().describe("Training given, under 300 characters"),
  accessibility: z.string().nullable().describe("Accessibility information stated, under 300 characters"),
  contactName: z.string().nullable().describe("A named contact for volunteering questions"),
  contactEmail: z.string().nullable().describe("Email for volunteering questions, if different from signupEmail"),
});

export type AutofillDraft = Partial<{
  [K in keyof z.infer<typeof schema>]: Exclude<z.infer<typeof schema>[K], null>;
}> & { nearestStation?: string };

const SYSTEM = `You fill in a volunteering directory for UCL students from an organisation's own web page or text.
Copy facts; never invent them. If the text doesn't state something, return null (or an empty list) for it.
Prefer what the text says about volunteering over anything about jobs, donations or services for clients.
Times are London times; convert "10am" to "10:00". Only include sessions that recur weekly on stated days.
Write summary and signupSteps in plain, friendly British English, addressed to a student ("you").
Links must be absolute https URLs that appear in the text; emails must appear in the text.`;

/** The fields the text supported, cleaned up, ready to merge into the editor's form. */
export async function extractEntry(text: string, sourceUrl: string | null): Promise<AutofillDraft> {
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema }),
    prompt: `${sourceUrl ? `Page: ${sourceUrl}\n\n` : ""}${text}`,
  });

  const draft: AutofillDraft = {};
  for (const [key, value] of Object.entries(output) as [keyof typeof output, unknown][]) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (draft as Record<string, unknown>)[key] = typeof value === "string" ? value.trim() : value;
  }
  // The same checks a save runs, so a malformed time can't reach the form.
  if (draft.sessions) {
    const checked = parseSessions(draft.sessions);
    if (checked.value?.length) draft.sessions = checked.value.map((s) => ({ ...s, where: s.where, note: s.note }));
    else delete draft.sessions;
  }
  if (draft.signupUrl && !/^https?:\/\//.test(draft.signupUrl)) delete draft.signupUrl;
  if (draft.orgUrl && !/^https?:\/\//.test(draft.orgUrl)) delete draft.orgUrl;
  if (draft.minAge !== undefined && (draft.minAge < 0 || draft.minAge > 99)) delete draft.minAge;
  return draft;
}

/**
 * The nearest Tube, Overground, DLR or rail station to a postcode, by
 * postcodes.io (for the coordinates) and TfL's StopPoint search. Null when
 * either can't say; it's a convenience, never a reason to fail.
 */
export async function nearestStation(postcode: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(6000);
    const pc = await fetchImpl(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`, { signal });
    if (!pc.ok) return null;
    const { result } = (await pc.json()) as { result?: { latitude?: number; longitude?: number } };
    if (result?.latitude == null || result.longitude == null) return null;
    const stops = await fetchImpl(
      `https://api.tfl.gov.uk/StopPoint?lat=${result.latitude}&lon=${result.longitude}&stopTypes=NaptanMetroStation,NaptanRailStation&radius=1500`,
      { signal },
    );
    if (!stops.ok) return null;
    const { stopPoints } = (await stops.json()) as { stopPoints?: { commonName: string; distance: number }[] };
    const nearest = stopPoints?.sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) return null;
    return cleanStationName(nearest.commonName);
  } catch {
    return null;
  }
}

/** "Aldgate East Underground Station" → "Aldgate East". */
export function cleanStationName(name: string): string {
  return name.replace(/\s+(Underground|DLR|Rail|Overground)?\s*Station$/i, "").replace(/\s+\(.*\)$/, "").trim();
}
