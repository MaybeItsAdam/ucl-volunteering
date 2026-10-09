"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, Trash2, X } from "lucide-react";
import { formatMinute } from "@/lib/planTime";
import {
  COMMITMENTS,
  freeSummary,
  INTERESTS,
  isFreeAt,
  labelOf,
  PERIODS,
  untilLabel,
  weekdayShort,
  type Volunteer,
} from "@/lib/volunteers";
import { FreeTimeHeatmap, type FreeAt } from "./FreeTimeHeatmap";
import "./volunteers.css";

const ANY = "";
const commitmentRank = (key: string) => COMMITMENTS.findIndex((c) => c.key === key);

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: Volunteer[]): string {
  const head = ["Name", "Email", "Course and year", "How often", "Around until", "Free in the week", "Interests", "Notes", "Signed up"];
  const lines = rows.map((v) =>
    [
      v.name,
      v.email,
      v.study ?? "",
      labelOf(COMMITMENTS, v.commitment),
      untilText(v),
      freeSummary(v.free_times).join("; "),
      v.interests.map((i) => labelOf(INTERESTS, i)).join("; "),
      v.notes ?? "",
      v.created_at.slice(0, 10),
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

/** The date they're around until, or the terms they ticked before there was one. */
function untilText(v: Volunteer): string {
  if (v.available_until) return untilLabel(v.available_until);
  return v.periods.map((p) => labelOf(PERIODS, p)).join(", ");
}

/**
 * The register, filtered down to who fits: how often (at least), still around
 * on a date, free at a half-hour picked on the heatmap, an interest, or a name. Copy emails and the CSV
 * take whoever the filters leave.
 */
export function VolunteersTable({ initial }: { initial: Volunteer[] }) {
  const [volunteers, setVolunteers] = useState(initial);
  const [query, setQuery] = useState("");
  const [minCommitment, setMinCommitment] = useState(ANY);
  const [onDate, setOnDate] = useState(ANY);
  const [freeAt, setFreeAt] = useState<FreeAt | null>(null);
  const [interest, setInterest] = useState(ANY);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everything but the half-hour: what the heatmap counts, so picking a time doesn't redraw it.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return volunteers.filter(
      (v) =>
        (!q || `${v.name} ${v.email} ${v.study ?? ""} ${v.notes ?? ""}`.toLowerCase().includes(q)) &&
        (!minCommitment || commitmentRank(v.commitment) >= commitmentRank(minCommitment)) &&
        (!onDate || !v.available_until || v.available_until >= onDate) &&
        (!interest || v.interests.includes(interest)),
    );
  }, [volunteers, query, minCommitment, onDate, interest]);
  const shown = useMemo(
    () => (freeAt ? matching.filter((v) => isFreeAt(v.free_times, freeAt.weekday, freeAt.minute)) : matching),
    [matching, freeAt],
  );

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
        <input
          className="input"
          type="date"
          aria-label="Still around on"
          title="Still around on"
          value={onDate}
          onChange={(e) => setOnDate(e.target.value)}
        />
        <select className="input" aria-label="Interest" value={interest} onChange={(e) => setInterest(e.target.value)}>
          <option value={ANY}>Any interest</option>
          {INTERESTS.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <FreeTimeHeatmap volunteers={matching} selected={freeAt} onSelect={setFreeAt} />

      <div className="vol-toolbar">
        <span className="vol-count">
          <span className="micro-label">
            {shown.length} of {volunteers.length}
          </span>
          {freeAt && (
            <button type="button" className="tag vol-free-at" onClick={() => setFreeAt(null)}>
              Free {weekdayShort(freeAt.weekday)} {formatMinute(freeAt.minute)}
              <X size={12} aria-label="Clear" />
            </button>
          )}
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
                  {v.available_until ? `Until ${untilLabel(v.available_until)}` : untilText(v) || <span className="dim">No end date</span>}
                  {v.free_times.length > 0 && (
                    <ul className="vol-free muted">
                      {freeSummary(v.free_times).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
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
