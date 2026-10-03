"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { formatMinute, londonDateAt, MINUTES_PER_DAY } from "@/lib/planTime";
import { CATEGORY_LABELS, EVENT_CATEGORIES, EVENT_STATUSES, STATUS_LABELS, type EventCategory, type EventStatus } from "@/lib/types";
import { createEvent } from "./api";
import { parseTime } from "./format";

export interface CreateDraft {
  day: string;
  start: number;
  end: number;
}

/** New VolSoc event: title, category, day, start/end, location, status → POST /api/plan/events. */
export function CreateEventSheet({ draft, onClose }: { draft: CreateDraft; onClose: () => void }) {
  const router = useRouter();
  const headingId = useId();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EventCategory>("social");
  const [status, setStatus] = useState<EventStatus>("provisional");
  const [day, setDay] = useState(draft.day);
  const [start, setStart] = useState(formatMinute(draft.start));
  const [end, setEnd] = useState(formatMinute(Math.min(draft.end, MINUTES_PER_DAY - 1)));
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const s = parseTime(start);
    let e = parseTime(end);
    if (!title.trim()) return setError("Give it a title.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || s === null || e === null) return setError("Pick a day and a start and end time.");
    // An end of 00:00 means midnight at the end of the day.
    if (e === 0) e = MINUTES_PER_DAY;
    if (e <= s) return setError("It has to end after it starts.");
    setSaving(true);
    setError(null);
    try {
      await createEvent({
        title: title.trim(),
        category,
        status,
        startsAt: londonDateAt(day, s).toISOString(),
        endsAt: londonDateAt(day, e).toISOString(),
        location: location.trim() || null,
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the event.");
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy={headingId}>
      <h3 id={headingId}>New VolSoc event</h3>
      <p>Times are London time. You can add the lead, links and notes once it&apos;s made.</p>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${headingId}-title`}>Title</label>
          <input id={`${headingId}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor={`${headingId}-category`}>Category</label>
            <select id={`${headingId}-category`} value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${headingId}-status`}>Status</label>
            <select id={`${headingId}-status`} value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
              {EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row plan-time-row">
          <div className="field">
            <label htmlFor={`${headingId}-day`}>Date</label>
            <input id={`${headingId}-day`} type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor={`${headingId}-start`}>Starts</label>
            <input id={`${headingId}-start`} type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor={`${headingId}-end`}>Ends</label>
            <input id={`${headingId}-end`} type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${headingId}-location`}>Location</label>
          <input id={`${headingId}-location`} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={500} />
        </div>
        {error && (
          <p className="plan-inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "Creating…" : "Create event"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
