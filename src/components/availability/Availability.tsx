"use client";

import { useMemo, useState } from "react";
import type { AvailabilityBlock, CommitteeMember } from "@/lib/types";
import { colourOf } from "./colours";
import { CommitteeView, type ShownMember } from "./CommitteeView";
import { DAY_RANGE, WEEKDAYS, WHOLE_WEEK, WIDE_RANGE } from "./grid";
import { WeekEditor } from "./WeekEditor";
import "./availability.css";

const NO_BLOCKS: AvailabilityBlock[] = [];

/**
 * The availability page: your own week to edit, and the committee's combined.
 * Which days and hours both show is chosen once, here. The view opens wide
 * enough to show everything already marked.
 */
export function Availability({
  me,
  members,
  blocks: initialBlocks,
  timetableBlocks = NO_BLOCKS,
  canSave,
}: {
  me: CommitteeMember;
  members: CommitteeMember[];
  blocks: AvailabilityBlock[];
  /** This week's lectures from linked UCL timetables. Shown, never edited or saved. */
  timetableBlocks?: AvailabilityBlock[];
  canSave: boolean;
}) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [wholeWeek, setWholeWeek] = useState(() => initialBlocks.some((b) => b.weekday > 5));
  const [wide, setWide] = useState(() =>
    initialBlocks.some((b) => b.startMinute < DAY_RANGE.start || b.endMinute > DAY_RANGE.end),
  );

  const days = wholeWeek ? WHOLE_WEEK : WEEKDAYS;
  const range = wide ? WIDE_RANGE : DAY_RANGE;

  // Everyone, with a colour each; you are always among them, even before the
  // committee list knows you (a fresh grant, or no database).
  const shownMembers = useMemo<ShownMember[]>(() => {
    const list = members.some((m) => m.id === me.id) ? members : [...members, me];
    return list.map((m, i) => ({ id: m.id, name: m.name, colour: colourOf(m, i) }));
  }, [members, me]);
  const myColour = shownMembers.find((m) => m.id === me.id)?.colour ?? null;
  const mine = useMemo(() => initialBlocks.filter((b) => b.memberId === me.id), [initialBlocks, me.id]);
  const withTimetables = useMemo(() => [...blocks, ...timetableBlocks], [blocks, timetableBlocks]);

  return (
    <div className="avail">
      <div className="avail-toolbar">
        <div className="segmented" role="group" aria-label="Days">
          <button type="button" aria-pressed={!wholeWeek} onClick={() => setWholeWeek(false)}>
            Mon–Fri
          </button>
          <button type="button" aria-pressed={wholeWeek} onClick={() => setWholeWeek(true)}>
            Whole week
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Hours">
          <button type="button" aria-pressed={!wide} onClick={() => setWide(false)}>
            <span className="mono">08–20</span>
          </button>
          <button type="button" aria-pressed={wide} onClick={() => setWide(true)}>
            <span className="mono">07–22</span>
          </button>
        </div>
      </div>

      <WeekEditor
        me={{ ...me, colour: myColour }}
        initialBlocks={mine}
        days={days}
        range={range}
        canSave={canSave}
        onSaved={(saved) => setBlocks((prev) => [...prev.filter((b) => b.memberId !== me.id), ...saved])}
      />

      <CommitteeView members={shownMembers} blocks={withTimetables} days={days} range={range} />
      {timetableBlocks.length > 0 && (
        <p className="avail-timetable-note">
          <span>Lectures are this week&rsquo;s, from linked UCL timetables</span>
          <span>Everyone else sees yours only as busy</span>
        </p>
      )}
    </div>
  );
}
