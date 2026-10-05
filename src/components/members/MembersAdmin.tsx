"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Search, X } from "lucide-react";
import {
  MEMBER_COLOURS,
  type GovernanceRole,
  type MemberColour,
  type RoleActor,
} from "@/lib/access";
import { Sheet } from "@/components/Sheet";
import {
  initials,
  judgeMemberPatch,
  matchesFilter,
  matchesSearch,
  MEMBER_FILTERS,
  roleTagLabel,
  type MemberFilter,
  type MemberPatch,
  type MemberRow,
} from "./rules";
import "./members.css";

const COLOUR_LABELS: Record<MemberColour, string> = {
  purple: "Purple",
  pink: "Pink",
  orange: "Orange",
  azure: "Azure",
  emerald: "Emerald",
  amber: "Amber",
};

// Pinned to London so the server render and the browser agree.
const seenFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London",
});

const ROLE_TONE: Record<GovernanceRole, string> = {
  admin: "info",
  principal: "info",
  committee: "ok",
};

type Status = { tone: "ok" | "bad"; text: string };

export function MembersAdmin({
  initialMembers,
  viewer,
}: {
  initialMembers: MemberRow[];
  viewer: RoleActor;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [colouring, setColouring] = useState<MemberRow | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  const searched = useMemo(
    () => members.filter((m) => matchesSearch(m, search)),
    [members, search],
  );
  const visible = useMemo(
    () => searched.filter((m) => matchesFilter(m, filter)),
    [searched, filter],
  );

  async function send(member: MemberRow, patch: MemberPatch, done: string) {
    setBusyId(member.id);
    try {
      const body =
        patch.kind === "role"
          ? { governanceRole: patch.governanceRole }
          : patch.kind === "unlock"
            ? { unlock: true }
            : { colour: patch.colour };
      const res = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: { member?: MemberRow; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.member)
        throw new Error(data.error || "Couldn't save that change.");
      const updated = data.member;
      setMembers((current) =>
        current.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      );
      setStatus({ tone: "ok", text: done });
    } catch (error) {
      setStatus({
        tone: "bad",
        text:
          error instanceof Error ? error.message : "Couldn't save that change.",
      });
    } finally {
      setBusyId(null);
    }
  }

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  return (
    <div className="mem">
      <div className="mem-toolbar">
        <label className="mem-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Search name or email"
            aria-label="Search members by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </label>
        <div className="mem-filters" role="group" aria-label="Filter members">
          {MEMBER_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className="mem-chip hit"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span className="mem-chip-count">
                {searched.filter((m) => matchesFilter(m, value)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p
        className={`mem-status${status ? ` is-${status.tone}` : ""}`}
        role="status"
        aria-live="polite"
      >
        {status?.text}
      </p>

      {members.length === 0 ? (
        <div className="panel empty">Nobody has signed in yet.</div>
      ) : visible.length === 0 ? (
        <div className="panel empty">
          No members match.{" "}
          <button
            type="button"
            className="button ghost small"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="table-wrap mem-table-wrap">
          <table className="table mem-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Last seen</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((member) => (
                <MemberTableRow
                  key={member.id}
                  member={member}
                  viewer={viewer}
                  busy={busyId === member.id}
                  onSend={send}
                  onColour={() => setColouring(member)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {colouring && (
        <ColourSheet
          member={members.find((m) => m.id === colouring.id) ?? colouring}
          busy={busyId === colouring.id}
          onPick={async (colour) => {
            await send(
              colouring,
              { kind: "colour", colour },
              `${firstName(colouring.name)} is now ${COLOUR_LABELS[colour].toLowerCase()}.`,
            );
            setColouring(null);
          }}
          onClose={() => setColouring(null)}
        />
      )}
    </div>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function MemberTableRow({
  member,
  viewer,
  busy,
  onSend,
  onColour,
}: {
  member: MemberRow;
  viewer: RoleActor;
  busy: boolean;
  onSend: (member: MemberRow, patch: MemberPatch, done: string) => void;
  onColour: () => void;
}) {
  const target = {
    id: member.id,
    governanceRole: member.governance_role,
    governanceRoleLocked: member.governance_role_locked,
  };
  const onCommittee = member.governance_role === "committee";
  const seatChange: MemberPatch = {
    kind: "role",
    governanceRole: onCommittee ? null : "committee",
  };
  const canSeat = judgeMemberPatch(viewer, target, seatChange) === null;
  const canUnlock =
    judgeMemberPatch(viewer, target, { kind: "unlock" }) === null;
  const isSelf = member.id === viewer.id;
  const name = firstName(member.name);

  return (
    <tr className="mem-row">
      <td className="mem-cell-member">
        <span className="mem-member">
          <button
            type="button"
            className="avatar mem-avatar hit"
            data-colour={member.colour ?? undefined}
            onClick={onColour}
            aria-label={`Change ${member.name}'s colour`}
            title="Change colour"
          >
            {initials(member.name)}
          </button>
          <span className="mem-name">
            {member.name}
            {isSelf && <span className="mem-you"> (you)</span>}
          </span>
        </span>
      </td>
      <td className="mem-cell-email">
        {member.email ? (
          <span className="mem-email">{member.email}</span>
        ) : (
          <span className="dim">No email</span>
        )}
      </td>
      <td className="mem-cell-role">
        <span className="mem-tags">
          <span
            className={`tag${member.governance_role ? ` ${ROLE_TONE[member.governance_role]}` : ""}`}
          >
            {roleTagLabel(member.governance_role)}
          </span>
          {member.governance_role_locked && (
            <span
              className="tag"
              title="Set by hand: Toolbox sign-in won't change it"
            >
              <Lock size={10} aria-hidden="true" /> Locked
            </span>
          )}
        </span>
      </td>
      <td className="mem-cell-seen">
        <span className="micro-label mem-cell-label">Last seen</span>
        <span className="mem-seen">
          {member.last_seen_at
            ? seenFormat.format(new Date(member.last_seen_at))
            : "Never"}
        </span>
      </td>
      <td className="mem-cell-actions">
        {canUnlock && (
          <button
            type="button"
            className="button small ghost"
            disabled={busy}
            onClick={() =>
              onSend(
                member,
                { kind: "unlock" },
                `${name}'s seat follows the Toolbox again.`,
              )
            }
          >
            Return to sync
          </button>
        )}
        {canSeat && (
          <button
            type="button"
            className={`button small${onCommittee ? " danger" : " primary"}`}
            disabled={busy}
            onClick={() =>
              onSend(
                member,
                seatChange,
                onCommittee
                  ? `${name} has been removed from the committee.`
                  : `${name} is now on the committee.`,
              )
            }
          >
            {onCommittee ? "Remove from committee" : "Add to committee"}
          </button>
        )}
      </td>
    </tr>
  );
}

function ColourSheet({
  member,
  busy,
  onPick,
  onClose,
}: {
  member: MemberRow;
  busy: boolean;
  onPick: (colour: MemberColour) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} labelledBy="mem-colour-title">
      <h3 id="mem-colour-title">{member.name}&apos;s colour</h3>
      <p>Marks them on the availability overlay and around the planner.</p>
      <div
        className="mem-swatches"
        role="radiogroup"
        aria-label="Identity colour"
      >
        {MEMBER_COLOURS.map((colour) => (
          <button
            key={colour}
            type="button"
            role="radio"
            aria-checked={member.colour === colour}
            className="mem-swatch-option"
            disabled={busy}
            onClick={() =>
              member.colour === colour ? onClose() : onPick(colour)
            }
          >
            <span className="swatch" data-colour={colour} aria-hidden="true" />
            {COLOUR_LABELS[colour]}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="button" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
