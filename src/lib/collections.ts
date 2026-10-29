import { londonTime } from "@/lib/planTime";

/**
 * Collection alerts: CH&Co staff post "there's food to collect" at /staff and
 * volunteers who opted in on the phone app are pushed a notification. Posting
 * and the push live in the routes; this is the part with rules in it.
 */

export const WINDOW_MINUTES = [30, 60, 120, 180, 240] as const;
export const MAX_ALERTS_PER_DAY = 10;

export interface CollectionPost {
  outlet: string;
  what: string;
  note: string | null;
  /** How long it's there for, from now. */
  minutes: number;
}

export interface CollectionAlert {
  id: string;
  outlet: string;
  what: string;
  note: string | null;
  collect_by: string;
  status: "open" | "collected" | "withdrawn";
  created_at: string;
}

export const ALERT_COLUMNS = "id,outlet,what,note,collect_by,status,created_at";

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

/** A post from the staff form, cleaned, or what's wrong with it. */
export function parseCollectionPost(body: unknown): { value: CollectionPost; error?: undefined } | { value?: undefined; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const outlet = clean(b.outlet, 80);
  const what = clean(b.what, 200);
  const note = clean(b.note, 300) || null;
  const minutes = Number(b.minutes);

  if (!outlet) return { error: "Say which outlet it's at" };
  if (!what) return { error: "Say what there is" };
  if (!(WINDOW_MINUTES as readonly number[]).includes(minutes)) return { error: "Pick how long it's there for" };
  return { value: { outlet, what, note, minutes } };
}

/** Whether an alert still invites a collection: open, and not past its time. */
export function isLive(alert: Pick<CollectionAlert, "status" | "collect_by">, now: Date): boolean {
  return alert.status === "open" && new Date(alert.collect_by).getTime() > now.getTime();
}

/** What the notification says. Short: lock screens cut it off. */
export function pushMessage(alert: Pick<CollectionAlert, "outlet" | "what" | "collect_by">): { title: string; body: string } {
  return {
    title: `Food to collect · ${alert.outlet}`,
    body: `${alert.what} — there until ${londonTime(new Date(alert.collect_by))}`,
  };
}

/** The same alert as a WhatsApp message, for staff to drop into the group. */
export function whatsappText(alert: Pick<CollectionAlert, "outlet" | "what" | "note" | "collect_by">, appUrl: string): string {
  const lines = [`🥪 Food to collect at ${alert.outlet}`, alert.what, `There until ${londonTime(new Date(alert.collect_by))}`];
  if (alert.note) lines.push(alert.note);
  lines.push("", `${appUrl.replace(/\/+$/, "")}/zero-food-waste`);
  return lines.join("\n");
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
