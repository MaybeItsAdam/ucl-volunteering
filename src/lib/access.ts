export const GOVERNANCE_ROLES = ["committee", "principal", "admin"] as const;
export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];

export const GOVERNANCE_LABELS: Record<GovernanceRole, string> = {
  admin: "Admin",
  principal: "Principal",
  committee: "Committee",
};

export type Capability = "view_whats_on" | "view_plan" | "edit_plan" | "manage_members" | "trigger_sync";

/** Everything access depends on. A role of null is signed in but not on the committee. */
export interface AccessProfile {
  governanceRole: GovernanceRole | null;
}

export function isGovernanceRole(value: unknown): value is GovernanceRole {
  return typeof value === "string" && GOVERNANCE_ROLES.includes(value as GovernanceRole);
}

/**
 * Anyone signed in sees What's on. The committee plans together: anyone with a
 * role can see and change the plan and run a sync. Who is on the committee is
 * the principals' call.
 */
export function can(profile: AccessProfile | null, capability: Capability): boolean {
  const role = profile?.governanceRole ?? null;
  switch (capability) {
    case "view_whats_on":
      return profile !== null;
    case "view_plan":
    case "edit_plan":
    case "trigger_sync":
      return role !== null;
    case "manage_members":
      return role === "principal" || role === "admin";
  }
}

export interface RoleActor {
  id: string;
  governanceRole: GovernanceRole | null;
}

export interface RoleTarget {
  id: string;
  governanceRole: GovernanceRole | null;
}

/**
 * Whether `actor` may move `target` between "no role" and "committee" on the
 * Members page. Principal and admin come from the Toolbox and are never granted
 * or removed in the app, and nobody changes their own seat.
 */
export function canChangeCommittee(actor: RoleActor, target: RoleTarget): boolean {
  if (actor.id === target.id) return false;
  if (!can(actor, "manage_members")) return false;
  return target.governanceRole === null || target.governanceRole === "committee";
}

/** The access profile of a member row, for `can()`. */
export function profileOf(member: { governance_role: GovernanceRole | null } | null): AccessProfile | null {
  return member ? { governanceRole: member.governance_role } : null;
}

export function roleLabel(role: GovernanceRole | null): string {
  return role ? GOVERNANCE_LABELS[role] : "Not on the committee";
}

/** Identity hues for members (availability overlay, avatars), in assignment order. */
export const MEMBER_COLOURS = ["purple", "pink", "orange", "azure", "emerald", "amber"] as const;
export type MemberColour = (typeof MEMBER_COLOURS)[number];

export function isMemberColour(value: unknown): value is MemberColour {
  return typeof value === "string" && MEMBER_COLOURS.includes(value as MemberColour);
}

/**
 * The colour for the next new member: the one fewest members have, earliest in
 * the list on a tie. Round-robin, but it fills the gaps left by people removed.
 */
export function nextMemberColour(existing: readonly (string | null)[]): MemberColour {
  const counts = new Map<MemberColour, number>(MEMBER_COLOURS.map((c) => [c, 0]));
  for (const colour of existing) if (isMemberColour(colour)) counts.set(colour, counts.get(colour)! + 1);
  let best: MemberColour = MEMBER_COLOURS[0];
  for (const colour of MEMBER_COLOURS) if (counts.get(colour)! < counts.get(best)!) best = colour;
  return best;
}
