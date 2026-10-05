"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Sheet } from "@/components/Sheet";
import { formatMinute, londonDateAt, londonDayKey, londonMinuteOfDay, MINUTES_PER_DAY, shiftDayKey } from "@/lib/planTime";
import {
  CATEGORY_LABELS,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  RESPONSE_KINDS,
  RESPONSE_LABELS,
  STATUS_LABELS,
  type CommitteeMember,
  type EventCategory,
  type EventSource,
  type EventStatus,
  type PlanEvent,
  type ResponseKind,
} from "@/lib/types";
import { deleteEvent, patchEvent, putResponse } from "./api";
import { dayLabel, initials, myResponse, parseTime, SOURCE_LABELS, STATUS_TAG, timeRange } from "./format";
import { eventDaySpan } from "./layout";
import "./plan.css";

export interface LinkOption {
  id: string;
  title: string;
  startsAt: string;
  source: EventSource;
}

const RESPONSE_TAG: Record<ResponseKind, string> = { going: "tag ok", maybe: "tag warn", no: "tag bad" };

function optionLabel(o: LinkOption) {
  const day = londonDayKey(new Date(o.startsAt));
  return `${dayLabel(day)} · ${o.title} (${SOURCE_LABELS[o.source]})`;
}

// ── Form state ──

interface FormState {
  title: string;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  allDay: boolean;
  location: string;
  description: string;
  url: string;
  category: EventCategory;
  status: EventStatus;
  leadMemberId: string;
  linkedEventId: string;
  planDocUrl: string;
  instagramUrl: string;
  recapUrl: string;
  notes: string;
  targetVolunteers: string;
  actualAttendance: string;
}

function toForm(event: PlanEvent): FormState {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const span = eventDaySpan(event);
  return {
    title: event.title,
    startDay: londonDayKey(start),
    startTime: formatMinute(londonMinuteOfDay(start)),
    // An all-day event's last day, not the midnight after it.
    endDay: event.allDay ? span.last : londonDayKey(end),
    endTime: formatMinute(londonMinuteOfDay(end)),
    allDay: event.allDay,
    location: event.location ?? "",
    description: event.description ?? "",
    url: event.url ?? "",
    category: event.category,
    status: event.status,
    leadMemberId: event.leadMemberId ?? "",
    linkedEventId: event.linkedEventId ?? "",
    planDocUrl: event.planDocUrl ?? "",
    instagramUrl: event.instagramUrl ?? "",
    recapUrl: event.recapUrl ?? "",
    notes: event.notes ?? "",
    targetVolunteers: event.targetVolunteers?.toString() ?? "",
    actualAttendance: event.actualAttendance?.toString() ?? "",
  };
}

const nullable = (v: string) => (v.trim() ? v.trim() : null);

function count(v: string, label: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} must be a whole number`);
  return n;
}

/** The PATCH body: only what changed, and for a Social Impact event only the committee's fields. */
function diff(event: PlanEvent, before: FormState, form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = (key: string, now: unknown, was: unknown) => {
    if (now !== was) body[key] = now;
  };
  set("category", form.category, before.category);
  set("status", form.status, before.status);
  set("leadMemberId", nullable(form.leadMemberId), nullable(before.leadMemberId));
  set("linkedEventId", nullable(form.linkedEventId), nullable(before.linkedEventId));
  set("planDocUrl", nullable(form.planDocUrl), nullable(before.planDocUrl));
  set("instagramUrl", nullable(form.instagramUrl), nullable(before.instagramUrl));
  set("recapUrl", nullable(form.recapUrl), nullable(before.recapUrl));
  set("notes", nullable(form.notes), nullable(before.notes));
  set("targetVolunteers", count(form.targetVolunteers, "Target volunteers"), count(before.targetVolunteers, ""));
  set("actualAttendance", count(form.actualAttendance, "Attendance"), count(before.actualAttendance, ""));
  if (event.source !== "volsoc") return body;

  if (!form.title.trim()) throw new Error("Give it a title");
  set("title", form.title.trim(), before.title);
  set("location", nullable(form.location), nullable(before.location));
  set("description", nullable(form.description), nullable(before.description));
  set("url", nullable(form.url), nullable(before.url));

  const timesChanged = (["startDay", "startTime", "endDay", "endTime", "allDay"] as const).some((k) => form[k] !== before[k]);
  if (timesChanged) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(form.endDay)) throw new Error("Pick the dates");
    let startsAt: Date;
    let endsAt: Date;
    if (form.allDay) {
      startsAt = londonDateAt(form.startDay, 0);
      endsAt = londonDateAt(shiftDayKey(form.endDay, 1), 0);
    } else {
      const s = parseTime(form.startTime);
      const e = parseTime(form.endTime);
      if (s === null || e === null) throw new Error("Pick a start and end time");
      startsAt = londonDateAt(form.startDay, s);
      // 00:00 on the same day as the start means the midnight after.
      endsAt = form.endDay === form.startDay && e === 0 ? londonDateAt(form.endDay, MINUTES_PER_DAY) : londonDateAt(form.endDay, e);
    }
    if (endsAt <= startsAt) throw new Error("It has to end after it starts");
    set("allDay", form.allDay, event.allDay);
    set("startsAt", startsAt.toISOString(), event.startsAt);
    set("endsAt", endsAt.toISOString(), event.endsAt);
  }
  return body;
}

// ── Component ──

export function EventDetail({
  event,
  committee,
  linked,
  linkOptions,
  myId,
  canEdit,
  backHref,
  tasks,
}: {
  event: PlanEvent;
  committee: CommitteeMember[];
  linked: LinkOption | null;
  linkOptions: LinkOption[];
  myId: string;
  canEdit: boolean;
  backHref: string;
  /** The event's Tasks panel (planner), shown above the edit form. */
  tasks?: ReactNode;
}) {
  const router = useRouter();
  const formId = useId();
  const isVolsoc = event.source === "volsoc";
  const lead = committee.find((m) => m.id === event.leadMemberId) ?? null;

  // Re-seed the form when the server sends a newer copy of the event.
  const initial = toForm(event);
  const [seen, setSeen] = useState(event.updatedAt);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mine, setMine] = useState<ResponseKind | null>(myResponse(event, myId));
  const [responseError, setResponseError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  if (seen !== event.updatedAt) {
    setSeen(event.updatedAt);
    setForm(initial);
    setMine(myResponse(event, myId));
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    let body: Record<string, unknown>;
    try {
      body = diff(event, initial, form);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Check the form");
      return;
    }
    if (!Object.keys(body).length) {
      setSaved(true);
      return;
    }
    setSaving(true);
    try {
      await patchEvent(event.id, body);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function respond(next: ResponseKind | null) {
    const before = mine;
    setMine(next);
    setResponseError(null);
    try {
      await putResponse(event.id, next);
      router.refresh();
    } catch (err) {
      setMine(before);
      setResponseError(err instanceof Error ? err.message : "Couldn't save your answer");
    }
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEvent(event.id);
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete");
      setDeleting(false);
    }
  }

  // Everyone's answer, mine as I've just set it.
  const answers = new Map(event.responses.map((r) => [r.memberId, r.response]));
  if (mine) answers.set(myId, mine);
  else answers.delete(myId);
  const tally = { going: 0, maybe: 0, no: 0 };
  for (const r of answers.values()) tally[r]++;

  const day = londonDayKey(new Date(event.startsAt));

  return (
    <>
      <header className="plan-detail-head">
        <span className="micro-label">
          {SOURCE_LABELS[event.source]} · {dayLabel(day)}
        </span>
        <h1 className={event.status === "cancelled" ? "plan-cancelled" : undefined}>{event.title}</h1>
      </header>

      {/* Summary */}
      <div className="panel plan-detail category-block" data-category={event.category} data-status={event.status}>
        <div className="plan-detail-tags">
          <span className="plan-cat-tag" data-category={event.category}>
            {CATEGORY_LABELS[event.category]}
          </span>
          <span className={STATUS_TAG[event.status]}>{STATUS_LABELS[event.status]}</span>
          <span className="tag plan-source-tag" data-source={event.source}>
            {SOURCE_LABELS[event.source]}
          </span>
          {event.removedAt && <span className="tag bad">Removed from the feed</span>}
        </div>
        <dl className="details">
          <dt>When</dt>
          <dd>
            {dayLabel(day)} <span className="mono">{timeRange(event)}</span>
          </dd>
          {event.location && (
            <>
              <dt>Where</dt>
              <dd>{event.location}</dd>
            </>
          )}
          <dt>Lead</dt>
          <dd>{lead ? lead.name : <span className="muted">No lead yet</span>}</dd>
          {linked && (
            <>
              <dt>Linked</dt>
              <dd>
                <Link href={`/portal/plan/events/${linked.id}`}>{optionLabel(linked)}</Link>
              </dd>
            </>
          )}
          {(event.targetVolunteers !== null || event.actualAttendance !== null) && (
            <>
              <dt>Numbers</dt>
              <dd className="mono">
                {event.targetVolunteers !== null && `target ${event.targetVolunteers}`}
                {event.targetVolunteers !== null && event.actualAttendance !== null && " · "}
                {event.actualAttendance !== null && `came ${event.actualAttendance}`}
              </dd>
            </>
          )}
          {event.description && (
            <>
              <dt>About</dt>
              <dd className="plan-pre">{event.description}</dd>
            </>
          )}
          {event.notes && (
            <>
              <dt>Notes</dt>
              <dd className="plan-pre">{event.notes}</dd>
            </>
          )}
        </dl>
        {(event.url || event.planDocUrl || event.instagramUrl || event.recapUrl) && (
          <div className="plan-links">
            {event.url && (
              <a className="button small" href={event.url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                {isVolsoc ? "Event page" : "SU page"}
              </a>
            )}
            {event.planDocUrl && (
              <a className="button small" href={event.planDocUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                Plan doc
              </a>
            )}
            {event.instagramUrl && (
              <a className="button small" href={event.instagramUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                Instagram
              </a>
            )}
            {event.recapUrl && (
              <a className="button small" href={event.recapUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                Recap
              </a>
            )}
          </div>
        )}
      </div>

      {/* Responses */}
      <div className="panel flush">
        <div className="panel-head plan-response-head">
          <span className="micro-label">Committee</span>
          <span className="plan-tally mono" aria-label={`${tally.going} going, ${tally.maybe} maybe, ${tally.no} can't`}>
            ✓ {tally.going} ? {tally.maybe} ✕ {tally.no}
          </span>
        </div>
        <div className="plan-my-response">
          <span className="micro-label">Your answer</span>
          <div className="segmented" role="group" aria-label="Your answer">
            {RESPONSE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={mine === kind}
                data-response={kind}
                onClick={() => respond(mine === kind ? null : kind)}
              >
                {RESPONSE_LABELS[kind]}
              </button>
            ))}
          </div>
          {responseError && (
            <span className="plan-inline-error" role="alert">
              {responseError}
            </span>
          )}
        </div>
        {committee.length > 0 ? (
          <ul className="rows plan-response-rows">
            {committee.map((m) => {
              const answer = answers.get(m.id) ?? null;
              return (
                <li key={m.id}>
                  <span className="avatar" data-colour={m.colour ?? undefined} aria-hidden="true">
                    {initials(m.name)}
                  </span>
                  <span className="plan-response-name">
                    {m.name}
                    {m.id === myId && <span className="muted"> (you)</span>}
                    {m.id === event.leadMemberId && <span className="tag info">Lead</span>}
                  </span>
                  {answer ? <span className={RESPONSE_TAG[answer]}>{RESPONSE_LABELS[answer]}</span> : <span className="tag">No answer</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">No one is on the committee yet</p>
        )}
      </div>

      {tasks}

      {/* Edit */}
      {canEdit && (
        <form className="panel plan-edit" onSubmit={save} noValidate>
          <h2 className="micro-label">Edit</h2>
          {!isVolsoc && (
            <p className="muted small">
              The title, time and place come from the {event.source === "social_impact" ? "Social Impact" : "VolSoc"} calendar on the Toolbox — here you can set what the committee is doing about it
            </p>
          )}

          {isVolsoc && (
            <>
              <div className="field">
                <label htmlFor={`${formId}-title`}>Title</label>
                <input id={`${formId}-title`} value={form.title} onChange={(e) => update("title", e.target.value)} maxLength={200} />
              </div>
              <label className="plan-check">
                <input type="checkbox" checked={form.allDay} onChange={(e) => update("allDay", e.target.checked)} />
                All day
              </label>
              <div className="field-row plan-time-row">
                <div className="field">
                  <label htmlFor={`${formId}-sd`}>{form.allDay ? "First day" : "Starts"}</label>
                  <input id={`${formId}-sd`} type="date" value={form.startDay} onChange={(e) => update("startDay", e.target.value)} />
                </div>
                {!form.allDay && (
                  <div className="field">
                    <label htmlFor={`${formId}-st`}>At</label>
                    <input id={`${formId}-st`} type="time" step={900} value={form.startTime} onChange={(e) => update("startTime", e.target.value)} />
                  </div>
                )}
                <div className="field">
                  <label htmlFor={`${formId}-ed`}>{form.allDay ? "Last day" : "Ends"}</label>
                  <input id={`${formId}-ed`} type="date" value={form.endDay} onChange={(e) => update("endDay", e.target.value)} />
                </div>
                {!form.allDay && (
                  <div className="field">
                    <label htmlFor={`${formId}-et`}>At</label>
                    <input id={`${formId}-et`} type="time" step={900} value={form.endTime} onChange={(e) => update("endTime", e.target.value)} />
                  </div>
                )}
              </div>
              <div className="field">
                <label htmlFor={`${formId}-loc`}>Location</label>
                <input id={`${formId}-loc`} value={form.location} onChange={(e) => update("location", e.target.value)} maxLength={500} />
              </div>
              <div className="field">
                <label htmlFor={`${formId}-desc`}>Description</label>
                <textarea id={`${formId}-desc`} value={form.description} onChange={(e) => update("description", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`${formId}-url`}>Event page link</label>
                <input id={`${formId}-url`} type="url" inputMode="url" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://" />
              </div>
            </>
          )}

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${formId}-cat`}>Category</label>
              <select id={`${formId}-cat`} value={form.category} onChange={(e) => update("category", e.target.value as EventCategory)}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${formId}-status`}>Status</label>
              <select id={`${formId}-status`} value={form.status} onChange={(e) => update("status", e.target.value as EventStatus)}>
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${formId}-lead`}>Lead</label>
              <select id={`${formId}-lead`} value={form.leadMemberId} onChange={(e) => update("leadMemberId", e.target.value)}>
                <option value="">No lead</option>
                {committee.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${formId}-link`}>Linked event</label>
            <select id={`${formId}-link`} value={form.linkedEventId} onChange={(e) => update("linkedEventId", e.target.value)}>
              <option value="">None</option>
              {linkOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionLabel(o)}
                </option>
              ))}
            </select>
            <span className="hint">
              {isVolsoc ? "The Social Impact event this runs alongside" : "The VolSoc event run alongside this"} — events within three weeks are listed
            </span>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${formId}-plan`}>Plan doc</label>
              <input id={`${formId}-plan`} type="url" inputMode="url" value={form.planDocUrl} onChange={(e) => update("planDocUrl", e.target.value)} placeholder="https://" />
            </div>
            <div className="field">
              <label htmlFor={`${formId}-ig`}>Instagram</label>
              <input id={`${formId}-ig`} type="url" inputMode="url" value={form.instagramUrl} onChange={(e) => update("instagramUrl", e.target.value)} placeholder="https://" />
            </div>
            <div className="field">
              <label htmlFor={`${formId}-recap`}>Recap</label>
              <input id={`${formId}-recap`} type="url" inputMode="url" value={form.recapUrl} onChange={(e) => update("recapUrl", e.target.value)} placeholder="https://" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${formId}-target`}>Target volunteers</label>
              <input id={`${formId}-target`} type="number" min={0} step={1} inputMode="numeric" value={form.targetVolunteers} onChange={(e) => update("targetVolunteers", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`${formId}-actual`}>Actual attendance</label>
              <input id={`${formId}-actual`} type="number" min={0} step={1} inputMode="numeric" value={form.actualAttendance} onChange={(e) => update("actualAttendance", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${formId}-notes`}>Notes</label>
            <textarea id={`${formId}-notes`} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </div>

          {saveError && (
            <p className="plan-inline-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="plan-edit-actions">
            {isVolsoc && (
              <button type="button" className="button danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
            <span className="plan-edit-spacer" />
            {saved && !saving && (
              <span className="tag ok" role="status">
                Saved
              </span>
            )}
            <button type="button" className="button ghost" onClick={() => setForm(initial)} disabled={saving}>
              Reset
            </button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {confirmDelete && (
        <Sheet onClose={() => setConfirmDelete(false)} labelledBy={`${formId}-del`}>
          <h3 id={`${formId}-del`}>Delete “{event.title}”?</h3>
          <p>It goes from the plan along with everyone&apos;s answers — this can&apos;t be undone; to keep a record, set it to Cancelled instead</p>
          {deleteError && (
            <p className="plan-inline-error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button type="button" className="button danger" onClick={remove} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete event"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
