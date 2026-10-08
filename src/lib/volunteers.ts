/**
 * The volunteer register (/volunteer): its options and the checks on a
 * sign-up. Pure, so the form, the route and the committee's table share it.
 *
 * The keys are what's stored; change a label freely, but renaming a key
 * strands the rows that already have it.
 */

export const COMMITMENTS = [
  { key: "one_off", label: "A one-off or two" },
  { key: "monthly", label: "About once a month" },
  { key: "fortnightly", label: "Every couple of weeks" },
  { key: "weekly", label: "Every week" },
  { key: "lots", label: "Several times a week" },
] as const;

export const PERIODS = [
  { key: "term1", label: "Term 1 (Sep–Dec)" },
  { key: "winter", label: "Winter break" },
  { key: "term2", label: "Term 2 (Jan–Mar)" },
  { key: "spring", label: "Spring break" },
  { key: "term3", label: "Term 3 (Apr–Jun)" },
  { key: "summer", label: "Summer" },
] as const;

export const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;

export const DAY_PARTS = [
  { key: "am", label: "Morning" },
  { key: "pm", label: "Afternoon" },
  { key: "eve", label: "Evening" },
] as const;

export const INTERESTS = [
  { key: "food", label: "Food rescue and Zero Food Waste" },
  { key: "homelessness", label: "Homelessness and outreach" },
  { key: "environment", label: "Environment and gardening" },
  { key: "education", label: "Tutoring and mentoring" },
  { key: "elderly", label: "Befriending older people" },
  { key: "refugees", label: "Refugees and asylum seekers" },
  { key: "health", label: "Health and wellbeing" },
  { key: "animals", label: "Animals" },
  { key: "events", label: "Running events and fundraising" },
  { key: "creative", label: "Design, social media and comms" },
] as const;

export type Commitment = (typeof COMMITMENTS)[number]["key"];

/** "mon_am" … "sun_eve": a part of a day in a typical week. */
export const SLOTS = DAYS.flatMap((d) => DAY_PARTS.map((p) => `${d.key}_${p.key}`));

export const labelOf = (options: readonly { key: string; label: string }[], key: string) =>
  options.find((o) => o.key === key)?.label ?? key;

export function slotLabel(slot: string): string {
  const [day, part] = slot.split("_");
  return `${labelOf(DAYS, day)} ${labelOf(DAY_PARTS, part).toLowerCase()}`;
}

/** A sign-up's answers; who signed up comes from their UCL sign-in, not the form. */
export interface VolunteerInput {
  study: string | null;
  commitment: Commitment;
  periods: string[];
  slots: string[];
  interests: string[];
  notes: string | null;
}

export interface Volunteer extends VolunteerInput {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export const VOLUNTEER_COLUMNS = "id,name,email,study,commitment,periods,slots,interests,notes,created_at,updated_at";

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/** Known keys only, each once, in the options' order. */
function pick(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set(value.filter((v): v is string => typeof v === "string"));
  return allowed.filter((k) => chosen.has(k));
}

/** A sign-up from the form, cleaned, or what's wrong with it in the form's voice. */
export function parseVolunteer(body: unknown): { value: VolunteerInput; error?: undefined } | { value?: undefined; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const commitment = COMMITMENTS.find((c) => c.key === b.commitment)?.key;

  if (!commitment) return { error: "Pick how often you could help" };
  if (b.consent !== true) return { error: "Tick the box so we can keep your details and get in touch" };

  return {
    value: {
      study: str(b.study, 120),
      commitment,
      periods: pick(b.periods, PERIODS.map((p) => p.key)),
      slots: pick(b.slots, SLOTS),
      interests: pick(b.interests, INTERESTS.map((i) => i.key)),
      notes: str(b.notes, 1000),
    },
  };
}
