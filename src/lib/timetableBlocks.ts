import { isoWeekday, londonDayKey, londonMinuteOfDay, MINUTES_PER_DAY, shiftDayKey } from "@/lib/planTime";
import type { AvailabilityBlock } from "@/lib/types";

/**
 * Timetable sessions as availability blocks, so the planner and the committee
 * view draw them like anything else someone marked. Pure: no database.
 *
 * The owner's blocks carry the title and room; everyone else's say only
 * `BUSY_NOTE`, because the caller never fetched anyone else's titles.
 */

export const BUSY_NOTE = "UCL timetable";

/** Block ids start with this, so nothing mistakes them for saved availability. */
export const TIMETABLE_BLOCK_PREFIX = "timetable:";

export interface SessionTimes {
  memberId: string;
  uid?: string;
  startsAt: string;
  endsAt: string;
  title?: string;
  location?: string | null;
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
    const note = session.title
      ? session.location
        ? `${session.title} · ${session.location}`
        : session.title
      : BUSY_NOTE;
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
