import type { GovernanceRole } from "@/lib/access";

export interface LockedRole {
  governance_role: GovernanceRole | null;
  governance_role_locked: boolean;
}

/** The roles only the Toolbox hands out; they override a lock set in the app. */
function isToolboxRole(role: GovernanceRole | null): boolean {
  return role === "principal" || role === "admin";
}

/**
 * The governance role to store when a sign-in proposes `incoming` (from the
 * Toolbox) for a member whose current row is `existing`. A committee seat set
 * by a principal survives, unless the Toolbox is promoting them to principal or
 * admin. Without a lock, the Toolbox's answer stands.
 */
export function lockedGovernanceRole(
  incoming: GovernanceRole | null,
  existing: LockedRole | undefined,
): GovernanceRole | null {
  if (!existing?.governance_role_locked || isToolboxRole(incoming)) return incoming;
  return existing.governance_role;
}
