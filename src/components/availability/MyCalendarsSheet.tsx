"use client";

import { Sheet } from "@/components/Sheet";
import type { CalendarLinksState } from "@/lib/calendarLinks";
import { MyCalendars } from "./MyCalendars";
import "./availability.css";

/** Your linked calendars on their own, straight from the calendar: no hunting inside Availability. */
export function MyCalendarsSheet({ state, onClose }: { state: CalendarLinksState | null; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} labelledBy="my-calendars-sheet-title">
      <div className="avail-sheet">
        <header className="avail-sheet-head">
          <h3 id="my-calendars-sheet-title">My calendars</h3>
          <button type="button" className="button ghost small" onClick={onClose}>
            Done
          </button>
        </header>
        {state ? (
          <MyCalendars initialState={state} />
        ) : (
          <div className="notice warn">
            <strong>Can&rsquo;t link a calendar right now</strong>
            <p>Linking needs the database, which isn&rsquo;t reachable</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
