import { describe, expect, it } from "vitest";
import type { GovernanceRole } from "@/lib/access";
import {
  auditAction,
  initials,
  judgeMemberPatch,
  matchesFilter,
  matchesSearch,
  memberUpdate,
  parseMemberPatch,
  roleTagLabel,
  sortMembers,
} from "./rules";

const actor = (governanceRole: GovernanceRole | null, id = "actor") => ({ id, governanceRole });
const target = (governanceRole: GovernanceRole | null, governanceRoleLocked = false, id = "target") => ({
  id,
  governanceRole,
  governanceRoleLocked,
});

describe("parseMemberPatch", () => {
  it("reads each kind of change", () => {
    expect(parseMemberPatch({ governanceRole: "committee" })).toEqual({ kind: "role", governanceRole: "committee" });
    expect(parseMemberPatch({ governanceRole: null })).toEqual({ kind: "role", governanceRole: null });
    expect(parseMemberPatch({ unlock: true })).toEqual({ kind: "unlock" });
    expect(parseMemberPatch({ colour: "emerald" })).toEqual({ kind: "colour", colour: "emerald" });
  });

  it("refuses roles the app can't grant", () => {
    expect(parseMemberPatch({ governanceRole: "principal" })).toBeNull();
    expect(parseMemberPatch({ governanceRole: "admin" })).toBeNull();
    expect(parseMemberPatch({ governanceRole: undefined })).toBeNull();
  });

  it("refuses anything else", () => {
    expect(parseMemberPatch(null)).toBeNull();
    expect(parseMemberPatch("committee")).toBeNull();
    expect(parseMemberPatch([])).toBeNull();
    expect(parseMemberPatch({})).toBeNull();
    expect(parseMemberPatch({ unlock: false })).toBeNull();
    expect(parseMemberPatch({ colour: "red" })).toBeNull();
    expect(parseMemberPatch({ name: "Someone" })).toBeNull();
  });

  it("takes one change at a time", () => {
    expect(parseMemberPatch({ governanceRole: "committee", colour: "pink" })).toBeNull();
    expect(parseMemberPatch({ unlock: true, governanceRole: null })).toBeNull();
  });
});

describe("judgeMemberPatch", () => {
  const add = { kind: "role", governanceRole: "committee" } as const;
  const remove = { kind: "role", governanceRole: null } as const;
  const unlock = { kind: "unlock" } as const;
  const colour = { kind: "colour", colour: "pink" } as const;

  it("lets principals and admins move people on and off the committee", () => {
    for (const role of ["principal", "admin"] as const) {
      expect(judgeMemberPatch(actor(role), target(null), add)).toBeNull();
      expect(judgeMemberPatch(actor(role), target("committee"), remove)).toBeNull();
    }
  });

  it("refuses anyone without manage_members", () => {
    for (const role of ["committee", null] as const) {
      for (const patch of [add, remove, unlock, colour]) {
        expect(judgeMemberPatch(actor(role), target(null, true), patch)).not.toBeNull();
      }
    }
  });

  it("leaves Toolbox roles alone", () => {
    for (const role of ["principal", "admin"] as const) {
      expect(judgeMemberPatch(actor("principal"), target(role), add)).toMatch(/Toolbox/);
      expect(judgeMemberPatch(actor("admin"), target(role), remove)).toMatch(/Toolbox/);
    }
  });

  it("never lets you change your own seat", () => {
    const self = target("principal", true, "actor");
    expect(judgeMemberPatch(actor("principal"), self, remove)).toMatch(/your own/);
    expect(judgeMemberPatch(actor("principal"), self, unlock)).toMatch(/your own/);
  });

  it("only returns a locked seat to sync", () => {
    expect(judgeMemberPatch(actor("principal"), target("committee", true), unlock)).toBeNull();
    expect(judgeMemberPatch(actor("principal"), target(null, true), unlock)).toBeNull();
    expect(judgeMemberPatch(actor("principal"), target("committee", false), unlock)).toMatch(/already/);
  });

  it("lets a manager recolour anyone, themselves included", () => {
    expect(judgeMemberPatch(actor("principal"), target("admin"), colour)).toBeNull();
    expect(judgeMemberPatch(actor("principal"), target("principal", false, "actor"), colour)).toBeNull();
  });
});

describe("memberUpdate and auditAction", () => {
  it("locks a seat set by hand and unlocks on return to sync", () => {
    expect(memberUpdate({ kind: "role", governanceRole: "committee" })).toEqual({
      governance_role: "committee",
      governance_role_locked: true,
    });
    expect(memberUpdate({ kind: "role", governanceRole: null })).toEqual({
      governance_role: null,
      governance_role_locked: true,
    });
    expect(memberUpdate({ kind: "unlock" })).toEqual({ governance_role_locked: false });
    expect(memberUpdate({ kind: "colour", colour: "amber" })).toEqual({ colour: "amber" });
  });

  it("names each action", () => {
    expect(auditAction({ kind: "role", governanceRole: "committee" })).toBe("member.add_committee");
    expect(auditAction({ kind: "role", governanceRole: null })).toBe("member.remove_committee");
    expect(auditAction({ kind: "unlock" })).toBe("member.unlock_role");
    expect(auditAction({ kind: "colour", colour: "azure" })).toBe("member.set_colour");
  });
});

describe("list helpers", () => {
  const people = [
    { name: "Zoe Ng", email: "zoe@ucl.ac.uk", governance_role: null },
    { name: "Ada Lovelace", email: null, governance_role: "committee" },
    { name: "Bea Hart", email: "BEA@ucl.ac.uk", governance_role: "principal" },
    { name: "Cal Moss", email: "cal@ucl.ac.uk", governance_role: "admin" },
    { name: "Abe Ng", email: "abe@ucl.ac.uk", governance_role: null },
  ] as const;

  it("filters by role", () => {
    expect(people.filter((p) => matchesFilter(p, "all"))).toHaveLength(5);
    expect(people.filter((p) => matchesFilter(p, "committee")).map((p) => p.name)).toEqual([
      "Ada Lovelace",
      "Bea Hart",
      "Cal Moss",
    ]);
    expect(people.filter((p) => matchesFilter(p, "none")).map((p) => p.name)).toEqual(["Zoe Ng", "Abe Ng"]);
  });

  it("searches name and email, ignoring case", () => {
    expect(people.filter((p) => matchesSearch(p, " ng ")).map((p) => p.name)).toEqual(["Zoe Ng", "Abe Ng"]);
    expect(people.filter((p) => matchesSearch(p, "bea@")).map((p) => p.name)).toEqual(["Bea Hart"]);
    expect(people.filter((p) => matchesSearch(p, ""))).toHaveLength(5);
  });

  it("sorts role holders first, then by name", () => {
    expect(sortMembers(people).map((p) => p.name)).toEqual(["Cal Moss", "Bea Hart", "Ada Lovelace", "Abe Ng", "Zoe Ng"]);
  });

  it("labels roles and initials", () => {
    expect(roleTagLabel("committee")).toBe("Committee");
    expect(roleTagLabel(null)).toBe("—");
    expect(initials("Ada  King Lovelace")).toBe("AL");
    expect(initials("Cher")).toBe("C");
    expect(initials("  ")).toBe("?");
  });
});
