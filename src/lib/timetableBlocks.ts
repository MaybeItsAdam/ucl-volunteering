import { PROVIDERS, type CalendarKind } from "@/lib/calendarProviders";
import { isoWeekday, londonDayKey, londonMinuteOfDay, MINUTES_PER_DAY, shiftDayKey } from "@/lib/planTime";
import type { AvailabilityBlock } from "@/lib/types";

/**
 * Linked calendars' busy times as availability blocks, so the planner and the
 * committee view draw them like anything else someone marked. Pure: no database.
 *
 * The owner's UCL timetable blocks carry the title and room, and their personal
 * calendars say "Busy (Google)" and so on. Everyone else's say only
 * `BUSY_NOTE` for a timetable or `PERSONAL_BUSY_NOTE` for anything else: the
 * caller never fetched anyone else's titles, and personal ones are never stored.
 */

export const BUSY_NOTE = "UCL timetable";
export const PERSONAL_BUSY_NOTE = "Busy";

/** Block ids start with this, so nothing mistakes them for saved availability. */
export const TIMETABLE_BLOCK_PREFIX = "timetable:";

export interface SessionTimes {
  memberId: string;
  uid?: string;
  startsAt: string;
  endsAt: string;
  title?: string;
  location?: string | null;
  /** Which kind of link it came from. Absent means a UCL timetable. */
  kind?: CalendarKind;
  /** Whether the viewer owns it, so a personal calendar can be named. */
  mine?: boolean;
}

function noteFor(session: SessionTimes): string {
  if (session.title) return session.location ? `${session.title} · ${session.location}` : session.title;
  if (!session.kind || session.kind === "ucl_timetable") return BUSY_NOTE;
  return session.mine ? `Busy (${PROVIDERS[session.kind].short})` : PERSONAL_BUSY_NOTE;
}

export function isTimetableBlock(block: Pick<AvailabilityBlock, "id">): boolean {
  return block.id.startsWith(TIMETABLE_BLOCK_PREFIX);
}

/**
 * One block per London day a session touches (a session past midnight is
 * split), limited to `days` when given. Weekdays are ISO, Monday 1.
 */
export function sessionsToBlocks(sessions: readonly SessionTimes[], days?: readonly string[]): AvailabilityBlock[] {
  const allowed = days ? new Set(days) : null;
  const blocks: AvailabilityBlock[] = [];
  sessions.forEach((session, index) => {
    const start = new Date(session.startsAt);
    const end = new Date(session.endsAt);
    if (!(end > start)) return;
    const firstDay = londonDayKey(start);
    const lastDay = londonDayKey(new Date(end.getTime() - 1));
    const note = noteFor(session);
    for (let day = firstDay, i = 0; day <= lastDay && i < 7; day = shiftDayKey(day, 1), i++) {
      if (allowed && !allowed.has(day)) continue;
      const startMinute = day === firstDay ? londonMinuteOfDay(start) : 0;
      const endMinute = day === lastDay ? londonMinuteOfDay(end) || MINUTES_PER_DAY : MINUTES_PER_DAY;
      if (endMinute <= startMinute) continue;
      blocks.push({
        id: `${TIMETABLE_BLOCK_PREFIX}${session.memberId}:${session.uid ?? index}:${day}`,
        memberId: session.memberId,
        weekday: isoWeekday(day),
        startMinute,
        endMinute,
        note,
      });
    }
  });
  return blocks;
}
