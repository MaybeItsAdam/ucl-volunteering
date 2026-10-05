"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import type { TimetableStatus } from "@/lib/timetable";
import type { AvailabilityBlock, CommitteeMember } from "@/lib/types";
import { colourOf } from "./colours";
import { CommitteeView, type ShownMember } from "./CommitteeView";
import { DAY_RANGE, WEEKDAYS, WHOLE_WEEK, WIDE_RANGE } from "./grid";
import { TimetableLink } from "./TimetableLink";
import { WeekEditor } from "./WeekEditor";
import "./availability.css";

type Tab = "mine" | "committee";

/**
 * Availability, opened from the calendar: your own week to edit (and your UCL
 * timetable to link), and the committee's combined with the best times to
 * meet. Which days and hours both show is chosen once, here, and opens wide
 * enough to show everything already marked.
 *
 * Saving refreshes the calendar behind, so its overlay shows the new times.
 * Closing with unsaved changes asks first.
 */
export function AvailabilitySheet({
  me,
  members,
  blocks: initialBlocks,
  timetableBlocks,
  timetableStatus,
  canSave,
  onClose,
}: {
  me: CommitteeMember;
  members: CommitteeMember[];
  blocks: AvailabilityBlock[];
  /** This week's lectures from linked UCL timetables. Shown, never edited or saved. */
  timetableBlocks: AvailabilityBlock[];
  timetableStatus: TimetableStatus | null;
  canSave: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mine");
  const [blocks, setBlocks] = useState(initialBlocks);
  const [wholeWeek, setWholeWeek] = useState(() => initialBlocks.some((b) => b.weekday > 5));
  const [wide, setWide] = useState(() =>
    initialBlocks.some((b) => b.startMinute < DAY_RANGE.start || b.endMinute > DAY_RANGE.end),
  );
  const dirty = useRef(false);
  const onDirtyChange = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);

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

  function close() {
    if (dirty.current && !window.confirm("Your week has unsaved changes — close without saving?")) return;
    onClose();
  }

  return (
    <Sheet onClose={close} labelledBy="avail-sheet-title" wide>
      <div className="avail-sheet">
        <header className="avail-sheet-head">
          <h3 id="avail-sheet-title">Availability</h3>
          <button type="button" className="button ghost small" onClick={close}>
            Done
          </button>
        </header>

        {!canSave && (
          <div className="notice warn">
            <strong>Can&rsquo;t save right now</strong>
            <p>The grid works, but saving and everyone else&rsquo;s times need the database</p>
          </div>
        )}

        <div className="subnav avail-sheet-tabs" role="tablist" aria-label="Availability">
          <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>
            Your week
          </button>
          <button type="button" role="tab" aria-selected={tab === "committee"} onClick={() => setTab("committee")}>
            Committee
          </button>
        </div>

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

        {/* Hidden, not unmounted, so switching tabs keeps unsaved painting. */}
        <div className="avail" hidden={tab !== "mine"}>
          <WeekEditor
            me={{ ...me, colour: myColour }}
            initialBlocks={mine}
            days={days}
            range={range}
            canSave={canSave}
            onDirtyChange={onDirtyChange}
            onSaved={(saved) => {
              setBlocks((prev) => [...prev.filter((b) => b.memberId !== me.id), ...saved]);
              router.refresh();
            }}
          />
          <TimetableLink initialStatus={timetableStatus} />
        </div>

        {tab === "committee" && (
          <div className="avail">
            <CommitteeView members={shownMembers} blocks={withTimetables} days={days} range={range} />
            {timetableBlocks.length > 0 && (
              <p className="avail-timetable-note">
                <span>Lectures are this week&rsquo;s, from linked UCL timetables</span>
                <span>Everyone else sees yours only as busy</span>
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
