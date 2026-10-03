import {
  can,
  canChangeCommittee,
  GOVERNANCE_LABELS,
  isMemberColour,
  type GovernanceRole,
  type MemberColour,
  type RoleActor,
  type RoleTarget,
} from "@/lib/access";

/**
 * The Members page's rules, pure so the page and PATCH /api/members/[id] judge
 * a change the same way and both can be tested without a database.
 */

/** What a member row on the page needs. */
export interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  governance_role: GovernanceRole | null;
  governance_role_locked: boolean;
  colour: MemberColour | null;
  last_seen_at: string | null;
}

/** The columns to select for a `MemberRow`. */
export const MEMBER_ROW_COLUMNS = "id,name,email,governance_role,governance_role_locked,colour,last_seen_at";

// ── PATCH body ──

export type MemberPatch =
  | { kind: "role"; governanceRole: "committee" | null }
  | { kind: "unlock" }
  | { kind: "colour"; colour: MemberColour };

/**
 * The one change a PATCH body asks for, or null when it is anything else.
 * Exactly one of `governanceRole`, `unlock: true` or `colour` per request.
 */
export function parseMemberPatch(body: unknown): MemberPatch | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1) return null;
  if ("governanceRole" in record) {
    const role = record.governanceRole;
    return role === null || role === "committee" ? { kind: "role", governanceRole: role } : null;
  }
  if ("unlock" in record) return record.unlock === true ? { kind: "unlock" } : null;
  if ("colour" in record) return isMemberColour(record.colour) ? { kind: "colour", colour: record.colour } : null;
  return null;
}

/**
 * Why `actor` may not make `patch` to `target`, or null when they may.
 *
 * - Committee seats: only between none and committee, never your own
 *   (`canChangeCommittee`). Principal and admin belong to the Toolbox.
 * - Return to sync: judged like a seat change, so a principal can't hand
 *   their own row back, and nobody unlocks a row that isn't locked.
 * - Colour: anyone who can manage members, on any row including their own.
 */
export function judgeMemberPatch(
  actor: RoleActor,
  target: RoleTarget & { governanceRoleLocked: boolean },
  patch: MemberPatch,
): string | null {
  if (!can(actor, "manage_members")) return "Only a principal or admin can manage members.";
  switch (patch.kind) {
    case "colour":
      return null;
    case "role":
    case "unlock":
      if (actor.id === target.id) return "You can't change your own committee seat.";
      if (patch.kind === "unlock") return target.governanceRoleLocked ? null : "This seat already follows the Toolbox.";
      if (!canChangeCommittee(actor, target)) {
        return "Principals and admins come from the Toolbox and can't be changed here.";
      }
      return null;
  }
}

/** The columns a permitted patch writes. A seat set by hand is locked against the next sign-in. */
export function memberUpdate(patch: MemberPatch): Record<string, unknown> {
  switch (patch.kind) {
    case "role":
      return { governance_role: patch.governanceRole, governance_role_locked: true };
    case "unlock":
      return { governance_role_locked: false };
    case "colour":
      return { colour: patch.colour };
  }
}

/** The audit action for a patch. */
export function auditAction(patch: MemberPatch): string {
  switch (patch.kind) {
    case "role":
      return patch.governanceRole ? "member.add_committee" : "member.remove_committee";
    case "unlock":
      return "member.unlock_role";
    case "colour":
      return "member.set_colour";
  }
}

// ── List ──

export type MemberFilter = "all" | "committee" | "none";

export const MEMBER_FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "committee", label: "Committee" },
  { value: "none", label: "No role" },
];

/** "Committee" means anyone with a role: principals and admins sit on the committee too. */
export function matchesFilter(member: Pick<MemberRow, "governance_role">, filter: MemberFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "committee":
      return member.governance_role !== null;
    case "none":
      return member.governance_role === null;
  }
}

/** Case-insensitive match on name or email; an empty query matches everyone. */
export function matchesSearch(member: Pick<MemberRow, "name" | "email">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return member.name.toLowerCase().includes(q) || (member.email?.toLowerCase().includes(q) ?? false);
}

/** Role holders first (admin, principal, committee), then everyone else; by name within each. */
export function sortMembers<T extends Pick<MemberRow, "name" | "governance_role">>(members: readonly T[]): T[] {
  const rank = (role: GovernanceRole | null) => (role === "admin" ? 0 : role === "principal" ? 1 : role === "committee" ? 2 : 3);
  return [...members].sort(
    (a, b) => rank(a.governance_role) - rank(b.governance_role) || a.name.localeCompare(b.name, "en-GB"),
  );
}

/** The role tag's text: "Admin", "Principal", "Committee" or a dash. */
export function roleTagLabel(role: GovernanceRole | null): string {
  return role ? GOVERNANCE_LABELS[role] : "—";
}

/** Up to two initials for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
