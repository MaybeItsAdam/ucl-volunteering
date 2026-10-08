"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, Trash2 } from "lucide-react";
import {
  COMMITMENTS,
  INTERESTS,
  labelOf,
  PERIODS,
  SLOTS,
  slotLabel,
  type Volunteer,
} from "@/lib/volunteers";
import "./volunteers.css";

const ANY = "";
const commitmentRank = (key: string) => COMMITMENTS.findIndex((c) => c.key === key);

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: Volunteer[]): string {
  const head = ["Name", "Email", "Course and year", "How often", "When in the year", "Free in the week", "Interests", "Notes", "Signed up"];
  const lines = rows.map((v) =>
    [
      v.name,
      v.email,
      v.study ?? "",
      labelOf(COMMITMENTS, v.commitment),
      v.periods.map((p) => labelOf(PERIODS, p)).join("; "),
      v.slots.map(slotLabel).join("; "),
      v.interests.map((i) => labelOf(INTERESTS, i)).join("; "),
      v.notes ?? "",
      v.created_at.slice(0, 10),
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

/**
 * The register, filtered down to who fits: how often (at least), when in the
 * year, a time in the week, an interest, or a name. Copy emails and the CSV
 * take whoever the filters leave.
 */
export function VolunteersTable({ initial }: { initial: Volunteer[] }) {
  const [volunteers, setVolunteers] = useState(initial);
  const [query, setQuery] = useState("");
  const [minCommitment, setMinCommitment] = useState(ANY);
  const [period, setPeriod] = useState(ANY);
  const [slot, setSlot] = useState(ANY);
  const [interest, setInterest] = useState(ANY);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return volunteers.filter(
      (v) =>
        (!q || `${v.name} ${v.email} ${v.study ?? ""} ${v.notes ?? ""}`.toLowerCase().includes(q)) &&
        (!minCommitment || commitmentRank(v.commitment) >= commitmentRank(minCommitment)) &&
        (!period || v.periods.includes(period)) &&
        (!slot || v.slots.includes(slot)) &&
        (!interest || v.interests.includes(interest)),
    );
  }, [volunteers, query, minCommitment, period, slot, interest]);

  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(shown.map((v) => v.email).join(", "));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't reach the clipboard; download the CSV instead");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `volunteers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(v: Volunteer) {
    if (!window.confirm(`Take ${v.name} off the register? This can't be undone`)) return;
    setError(null);
    const res = await fetch(`/api/volunteers/${v.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Couldn't remove them, try again");
      return;
    }
    setVolunteers((list) => list.filter((x) => x.id !== v.id));
  }

  if (!volunteers.length) {
    return <div className="panel empty">No one has signed up yet — share the /volunteer link to get started</div>;
  }

  return (
    <>
      <div className="vol-filters">
        <input
          className="input vol-search"
          type="search"
          placeholder="Search names, emails, notes"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" aria-label="How often" value={minCommitment} onChange={(e) => setMinCommitment(e.target.value)}>
          <option value={ANY}>Any amount of time</option>
          {COMMITMENTS.slice(1).map((c) => (
            <option key={c.key} value={c.key}>
              At least {c.label.toLowerCase()}
            </option>
          ))}
        </select>
        <select className="input" aria-label="When in the year" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value={ANY}>Any time of year</option>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Free in the week" value={slot} onChange={(e) => setSlot(e.target.value)}>
          <option value={ANY}>Any day or time</option>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {slotLabel(s)}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Interest" value={interest} onChange={(e) => setInterest(e.target.value)}>
          <option value={ANY}>Any interest</option>
          {INTERESTS.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <div className="vol-toolbar">
        <span className="micro-label">
          {shown.length} of {volunteers.length}
        </span>
        <div className="vol-actions">
          <button type="button" className="button small" onClick={copyEmails} disabled={!shown.length}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? "Copied" : "Copy emails"}
          </button>
          <button type="button" className="button small" onClick={download} disabled={!shown.length}>
            <Download size={14} aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="notice bad" role="alert">
          <strong>{error}</strong>
        </div>
      )}

      <div className="table-wrap">
        <table className="table vol-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>How often</th>
              <th>When</th>
              <th>Interests</th>
              <th>Notes</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>{v.name}</strong>
                  <div className="muted small">
                    <a href={`mailto:${v.email}`}>{v.email}</a>
                  </div>
                  {v.study && <div className="dim small">{v.study}</div>}
                </td>
                <td>{labelOf(COMMITMENTS, v.commitment)}</td>
                <td className="small">
                  {v.periods.length ? v.periods.map((p) => labelOf(PERIODS, p)).join(", ") : <span className="dim">—</span>}
                  {v.slots.length > 0 && <div className="muted">{v.slots.map(slotLabel).join(", ")}</div>}
                </td>
                <td>
                  <div className="vol-tags">
                    {v.interests.map((i) => (
                      <span key={i} className="tag">
                        {labelOf(INTERESTS, i)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="small vol-notes">{v.notes}</td>
                <td>
                  <button type="button" className="icon-button" aria-label={`Remove ${v.name}`} onClick={() => remove(v)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
