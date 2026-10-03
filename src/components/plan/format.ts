import { formatMinute, isoWeekday, londonDayKey, londonMinuteOfDay, shiftDayKey, shortDate } from "@/lib/planTime";
import type { EventSource, PlanEvent, ResponseKind } from "@/lib/types";
import { eventDaySpan } from "./layout";

/** Display helpers shared by the plan pages. Pure; safe on server and client. */

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SOURCE_LABELS: Record<EventSource, string> = {
  volsoc: "VolSoc",
  social_impact: "Social Impact",
};

/** "Wed 30 Sep" */
export function dayLabel(key: string): string {
  return `${WEEKDAYS_SHORT[isoWeekday(key) - 1]} ${shortDate(key)}`;
}

/** "11 AM", "12 PM", "9 PM" */
export function hourLabel(hour: number): string {
  const h = hour % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h < 12 ? "AM" : "PM"}`;
}

/** "18:00–20:00", "All day", "Mon 28 Sep – Wed 30 Sep", or "21:00 – Sat 02:00" across midnight. */
export function timeRange(event: Pick<PlanEvent, "startsAt" | "endsAt" | "allDay">): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const span = eventDaySpan(event as PlanEvent);
  if (event.allDay) return span.first === span.last ? "All day" : `${dayLabel(span.first)} – ${dayLabel(span.last)}`;
  const from = formatMinute(londonMinuteOfDay(start));
  const to = formatMinute(londonMinuteOfDay(end));
  if (span.first === span.last) return `${from}–${to}`;
  const endDay = londonDayKey(end);
  return endDay === shiftDayKey(span.first, 1) ? `${from} – ${WEEKDAYS_SHORT[isoWeekday(endDay) - 1]} ${to}` : `${from} – ${dayLabel(endDay)} ${to}`;
}

/** The week label's date range: "28 Sep – 4 Oct". */
export function weekRange(monday: string): string {
  return `${shortDate(monday)} – ${shortDate(shiftDayKey(monday, 6))}`;
}

export function responseCounts(event: Pick<PlanEvent, "responses">): Record<ResponseKind, number> {
  const counts: Record<ResponseKind, number> = { going: 0, maybe: 0, no: 0 };
  for (const r of event.responses) counts[r.response]++;
  return counts;
}

export function myResponse(event: Pick<PlanEvent, "responses">, memberId: string | null): ResponseKind | null {
  if (!memberId) return null;
  return event.responses.find((r) => r.memberId === memberId)?.response ?? null;
}

/** Status tag class: confirmed ok, provisional warn, cancelled bad. */
export const STATUS_TAG: Record<PlanEvent["status"], string> = {
  confirmed: "tag ok",
  provisional: "tag warn",
  cancelled: "tag bad",
};

/** Two-letter initials for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? ""))).toUpperCase();
}

/** Minutes from "HH:MM", or null. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
