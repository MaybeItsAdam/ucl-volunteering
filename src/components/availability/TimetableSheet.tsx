"use client";

import { Sheet } from "@/components/Sheet";
import type { TimetableStatus } from "@/lib/timetable";
import { TimetableLink } from "./TimetableLink";
import "./availability.css";

/** Your UCL timetable on its own, straight from the calendar: no hunting inside Availability. */
export function TimetableSheet({ status, onClose }: { status: TimetableStatus | null; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} labelledBy="timetable-sheet-title">
      <div className="avail-sheet">
        <header className="avail-sheet-head">
          <h3 id="timetable-sheet-title">Your UCL timetable</h3>
          <button type="button" className="button ghost small" onClick={onClose}>
            Done
          </button>
        </header>
        {status ? (
          <TimetableLink initialStatus={status} />
        ) : (
          <div className="notice warn">
            <strong>Can&rsquo;t link a timetable right now</strong>
            <p>Linking needs the database, which isn&rsquo;t reachable</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
