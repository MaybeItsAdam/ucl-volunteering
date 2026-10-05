import { describe, expect, it } from "vitest";
import { can, canChangeCommittee, nextMemberColour, type GovernanceRole } from "./access";
import { availablePages } from "./app-pages";
import { lockedGovernanceRole } from "./roleLocks";

const as = (governanceRole: GovernanceRole | null) => ({ governanceRole });

describe("capabilities", () => {
  it("lets any committee role see and edit the plan and sync", () => {
    for (const role of ["committee", "principal", "admin"] as const) {
      expect(can(as(role), "view_plan")).toBe(true);
      expect(can(as(role), "edit_plan")).toBe(true);
      expect(can(as(role), "trigger_sync")).toBe(true);
    }
  });

  it("keeps member management to principals and admins", () => {
    expect(can(as("committee"), "manage_members")).toBe(false);
    expect(can(as("principal"), "manage_members")).toBe(true);
    expect(can(as("admin"), "manage_members")).toBe(true);
  });

  it("gives someone with no role nothing", () => {
    for (const capability of ["view_plan", "edit_plan", "manage_members", "trigger_sync"] as const) {
      expect(can(as(null), capability)).toBe(false);
      expect(can(null, capability)).toBe(false);
    }
  });
});

describe("tabs", () => {
  it("shows a person with no role only Settings", () => {
    expect(availablePages(as(null))).toEqual(["settings"]);
    expect(availablePages(null)).toEqual(["settings"]);
  });

  it("puts the calendar first for the committee, and members only for principals", () => {
    expect(availablePages(as("committee"))).toEqual(["calendar", "settings"]);
    expect(availablePages(as("principal"))).toEqual(["calendar", "members", "settings"]);
  });
});

describe("committee seats", () => {
  const principal = { id: "p", governanceRole: "principal" as const };

  it("lets a principal grant and remove committee, but not touch principals or themselves", () => {
    expect(canChangeCommittee(principal, { id: "a", governanceRole: null })).toBe(true);
    expect(canChangeCommittee(principal, { id: "a", governanceRole: "committee" })).toBe(true);
    expect(canChangeCommittee(principal, { id: "a", governanceRole: "principal" })).toBe(false);
    expect(canChangeCommittee(principal, { id: "p", governanceRole: "principal" })).toBe(false);
  });

  it("does not let committee change seats", () => {
    expect(canChangeCommittee({ id: "c", governanceRole: "committee" }, { id: "a", governanceRole: null })).toBe(false);
  });

  it("keeps a locked seat through sign-in unless the Toolbox promotes them", () => {
    const locked = { governance_role: "committee" as const, governance_role_locked: true };
    expect(lockedGovernanceRole(null, locked)).toBe("committee");
    expect(lockedGovernanceRole("principal", locked)).toBe("principal");
    const removed = { governance_role: null, governance_role_locked: true };
    expect(lockedGovernanceRole("committee", removed)).toBeNull();
    expect(lockedGovernanceRole(null, { governance_role: "committee", governance_role_locked: false })).toBeNull();
    expect(lockedGovernanceRole("committee", undefined)).toBe("committee");
  });
});

describe("member colours", () => {
  it("goes round in order, filling the least-used first", () => {
    expect(nextMemberColour([])).toBe("purple");
    expect(nextMemberColour(["purple"])).toBe("pink");
    expect(nextMemberColour(["purple", "pink", "orange", "azure", "emerald", "amber"])).toBe("purple");
    expect(nextMemberColour(["purple", "purple", "pink", "orange", "azure", "emerald", "amber"])).toBe("pink");
    expect(nextMemberColour([null, "nonsense"])).toBe("purple");
  });
});
