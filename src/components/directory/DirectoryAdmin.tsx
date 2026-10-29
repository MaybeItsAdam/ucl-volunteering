"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { CheckCheck, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import {
  CAUSES,
  COMMITMENT_KINDS,
  DBS_OPTIONS,
  isStale,
  SIGNUP_METHODS,
  WEEKDAYS,
  type DirectoryEntry,
  type Session,
} from "@/lib/directory";
import "./directory.css";

/** The editor's form state: the entry's fields, all as the inputs hold them. */
interface Form {
  organisation: string;
  orgUrl: string;
  title: string;
  summary: string;
  description: string;
  causes: string[];
  commitment: string;
  timeNeeded: string;
  signupMethod: string;
  signupUrl: string;
  signupEmail: string;
  signupSteps: string;
  sessions: { weekday: number; start: string; end: string; where: string; note: string }[];
  address: string;
  postcode: string;
  nearestStation: string;
  remote: boolean;
  minAge: string;
  dbs: string;
  expensesPaid: boolean;
  training: string;
  accessibility: string;
  contactName: string;
  contactEmail: string;
  active: boolean;
}

const BLANK: Form = {
  organisation: "",
  orgUrl: "",
  title: "",
  summary: "",
  description: "",
  causes: [],
  commitment: "regular",
  timeNeeded: "",
  signupMethod: "email",
  signupUrl: "",
  signupEmail: "",
  signupSteps: "",
  sessions: [],
  address: "",
  postcode: "",
  nearestStation: "",
  remote: false,
  minAge: "18",
  dbs: "not_needed",
  expensesPaid: false,
  training: "",
  accessibility: "",
  contactName: "",
  contactEmail: "",
  active: true,
};

function formOf(e: DirectoryEntry): Form {
  return {
    organisation: e.organisation,
    orgUrl: e.orgUrl ?? "",
    title: e.title,
    summary: e.summary,
    description: e.description ?? "",
    causes: e.causes,
    commitment: e.commitment,
    timeNeeded: e.timeNeeded ?? "",
    signupMethod: e.signupMethod,
    signupUrl: e.signupUrl ?? "",
    signupEmail: e.signupEmail ?? "",
    signupSteps: e.signupSteps ?? "",
    sessions: e.sessions.map((s: Session) => ({ ...s, where: s.where ?? "", note: s.note ?? "" })),
    address: e.address ?? "",
    postcode: e.postcode ?? "",
    nearestStation: e.nearestStation ?? "",
    remote: e.remote,
    minAge: e.minAge == null ? "" : String(e.minAge),
    dbs: e.dbs,
    expensesPaid: e.expensesPaid,
    training: e.training ?? "",
    accessibility: e.accessibility ?? "",
    contactName: e.contactName ?? "",
    contactEmail: e.contactEmail ?? "",
    active: e.active,
  };
}

async function send(url: string, method: string, body?: unknown): Promise<{ entry?: DirectoryEntry }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as { entry?: DirectoryEntry; error?: string } | null;
  if (!res.ok) throw new Error(data?.error || "Something went wrong, try again");
  return data ?? {};
}

/** The committee's list of directory entries: add, edit, mark checked, take down. */
export function DirectoryAdmin({ initial, today }: { initial: DirectoryEntry[]; today: string }) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<DirectoryEntry | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...entries].sort((a, b) => a.organisation.localeCompare(b.organisation) || a.title.localeCompare(b.title));
  const staleCount = entries.filter((e) => e.active && isStale(e.verifiedOn, today)).length;

  function upsert(entry: DirectoryEntry) {
    setEntries((list) => (list.some((e) => e.id === entry.id) ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]));
  }

  async function verify(entry: DirectoryEntry) {
    setError(null);
    try {
      const { entry: saved } = await send(`/api/directory/${entry.id}`, "PATCH", { verified: true });
      if (saved) upsert(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <div className="page-actions">
        <button type="button" className="button primary" onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden="true" /> Add a place
        </button>
      </div>

      {staleCount > 0 && (
        <div className="notice warn">
          <strong>
            {staleCount} {staleCount === 1 ? "entry hasn't" : "entries haven't"} been checked in six months
          </strong>
          <p>Check the times and sign-up details are still right, then press &ldquo;Still right&rdquo;. The public page warns visitors until you do</p>
        </div>
      )}
      {error && (
        <p className="planner-error" role="alert">
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="panel">
          <p className="empty">Nothing in the directory yet</p>
        </div>
      ) : (
        <div className="panel flush">
          <ul className="rows">
            {sorted.map((e) => {
              const stale = isStale(e.verifiedOn, today);
              return (
                <li key={e.id} className="dir-admin-row">
                  <div className="dir-admin-main">
                    <span className="micro-label">{e.organisation}</span>
                    <button type="button" className="link-button" onClick={() => setEditing(e)}>
                      <strong>{e.title}</strong>
                    </button>
                    <span className="muted small">
                      {!e.active && <span className="tag">Hidden</span>} {stale ? <span className="tag warn">Needs checking</span> : `Checked ${e.verifiedOn}`}
                    </span>
                  </div>
                  <div className="dir-admin-actions">
                    {e.active && (
                      <Link className="button small ghost" href={`/opportunities/${e.slug}`} aria-label={`View ${e.title} on the public page`}>
                        <ExternalLink size={14} aria-hidden="true" />
                      </Link>
                    )}
                    <button type="button" className="button small" onClick={() => verify(e)}>
                      <CheckCheck size={14} aria-hidden="true" /> Still right
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && (
        <EntrySheet
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            upsert(saved);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setEntries((list) => list.filter((e) => e.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function EntrySheet({
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: DirectoryEntry | null;
  onClose: () => void;
  onSaved: (entry: DirectoryEntry) => void;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const [form, setForm] = useState<Form>(entry ? formOf(entry) : BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setSession = (i: number, patch: Partial<Form["sessions"][number]>) =>
    set(
      "sessions",
      form.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { entry: saved } = entry ? await send(`/api/directory/${entry.id}`, "PATCH", form) : await send("/api/directory", "POST", form);
      if (saved) onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || !window.confirm(`Delete ${entry.title} from the directory? Hiding it keeps it for later`)) return;
    setBusy(true);
    try {
      await send(`/api/directory/${entry.id}`, "DELETE");
      onDeleted(entry.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const field = (key: keyof Form, label: string, props: { placeholder?: string; type?: string; hint?: string; maxLength?: number } = {}) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        id={`${id}-${key}`}
        type={props.type ?? "text"}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
      />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
  const area = (key: keyof Form, label: string, placeholder: string, maxLength: number) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <textarea id={`${id}-${key}`} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} placeholder={placeholder} maxLength={maxLength} />
    </div>
  );
  const select = (key: keyof Form, label: string, options: readonly { key: string; label: string }[]) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <select id={`${id}-${key}`} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Sheet onClose={onClose} labelledBy={`${id}-head`}>
      <form onSubmit={save} noValidate>
        <h3 id={`${id}-head`}>{entry ? `Edit ${entry.title}` : "Add a place"}</h3>
        <fieldset disabled={busy}>
          <div className="field-row">
            {field("organisation", "Organisation", { placeholder: "Crisis Skylight", maxLength: 120 })}
            {field("title", "Role", { placeholder: "Kitchen volunteer", maxLength: 120 })}
          </div>
          {field("summary", "One line", { placeholder: "Help cook and serve lunch for members", maxLength: 200 })}
          <div className="field">
            <span className="micro-label">Causes</span>
            <div className="dir-checks">
              {CAUSES.map((c) => (
                <label key={c.key}>
                  <input
                    type="checkbox"
                    checked={form.causes.includes(c.key)}
                    onChange={(e) => set("causes", e.target.checked ? [...form.causes, c.key] : form.causes.filter((k) => k !== c.key))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <h4 className="micro-label">Signing up</h4>
          <div className="field-row">
            {select("signupMethod", "How", SIGNUP_METHODS)}
            {select("commitment", "Commitment", COMMITMENT_KINDS)}
          </div>
          <div className="field-row">
            {field("signupUrl", "Sign-up link", { placeholder: "https://", type: "url" })}
            {field("signupEmail", "Sign-up email", { placeholder: "volunteer@…", type: "email" })}
          </div>
          {area("signupSteps", "What happens", "Email Sam with your availability. She replies within a week and books a 20-minute induction call", 1000)}

          <h4 className="micro-label">When</h4>
          {field("timeNeeded", "Time needed", { placeholder: "3 hours a week, term time", maxLength: 120 })}
          {form.sessions.map((s, i) => (
            <div key={i} className="dir-session-edit">
              <select aria-label="Day" value={s.weekday} onChange={(e) => setSession(i, { weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((d, n) => (
                  <option key={d} value={n + 1}>
                    {d}
                  </option>
                ))}
              </select>
              <input type="time" aria-label="Starts" value={s.start} onChange={(e) => setSession(i, { start: e.target.value })} />
              <input type="time" aria-label="Ends" value={s.end} onChange={(e) => setSession(i, { end: e.target.value })} />
              <button
                type="button"
                className="button small ghost"
                aria-label="Remove this session"
                onClick={() => set("sessions", form.sessions.filter((_, j) => j !== i))}
              >
                <X size={14} aria-hidden="true" />
              </button>
              <div className="dir-session-extra">
                <input aria-label="Where, if not the main address" placeholder="Where (optional)" value={s.where} onChange={(e) => setSession(i, { where: e.target.value })} />
                <input aria-label="Note" placeholder="Note, e.g. term time only" value={s.note} onChange={(e) => setSession(i, { note: e.target.value })} />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button small"
            onClick={() => set("sessions", [...form.sessions, { weekday: 1, start: "10:00", end: "12:00", where: "", note: "" }])}
          >
            <Plus size={14} aria-hidden="true" /> Add a session time
          </button>

          <h4 className="micro-label">Where</h4>
          {field("address", "Address", { placeholder: "66 Commercial St", maxLength: 200 })}
          <div className="field-row">
            {field("postcode", "Postcode", { placeholder: "E1 6LT", maxLength: 10 })}
            {field("nearestStation", "Nearest station", { placeholder: "Aldgate East", maxLength: 80 })}
          </div>

          <h4 className="micro-label">What you need</h4>
          <div className="field-row">
            {field("minAge", "Minimum age", { type: "number", hint: "Blank for any age" })}
            {select("dbs", "DBS", DBS_OPTIONS)}
          </div>
          <div className="dir-checks field">
            <label>
              <input type="checkbox" checked={form.remote} onChange={(e) => set("remote", e.target.checked)} /> Can be done remotely
            </label>
            <label>
              <input type="checkbox" checked={form.expensesPaid} onChange={(e) => set("expensesPaid", e.target.checked)} /> Expenses paid
            </label>
          </div>
          {area("training", "Training", "Food hygiene certificate on your first shift", 500)}
          {area("accessibility", "Accessibility", "Step-free entrance; the kitchen is on the ground floor", 500)}

          <h4 className="micro-label">More</h4>
          {area("description", "About the role", "What a shift is like, who you'll work with…", 4000)}
          <div className="field-row">
            {field("contactName", "Contact name", { maxLength: 120 })}
            {field("contactEmail", "Contact email", { type: "email" })}
          </div>
          {field("orgUrl", "Their website", { placeholder: "https://", type: "url" })}
          <label className="dir-checks field">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Show on the public page
          </label>
        </fieldset>

        {error && (
          <p className="planner-error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">Saving marks it as checked today</p>
        <div className="modal-actions">
          {entry && (
            <button type="button" className="button danger" onClick={remove} disabled={busy}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          )}
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
