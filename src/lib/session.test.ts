import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, getCurrentMember, readSessionToken, type VolsocSession } from "./session";

process.env.SESSION_SECRET = "12345678901234567890123456789012";

let cookieStore: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieStore[name] ? { value: cookieStore[name] } : undefined),
    set: (name: string, value: string) => {
      cookieStore[name] = value;
    },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  getSupabaseAdmin: () => ({}),
}));

const session: VolsocSession = {
  toolboxUserId: "tb-1",
  memberId: "member-1",
  email: "someone@ucl.ac.uk",
  name: "Some One",
  governanceRoleAtSignIn: "committee",
};

describe("session tokens", () => {
  beforeEach(() => {
    cookieStore = {};
  });

  it("round-trips a signed session", async () => {
    const token = await createSessionToken(session);
    expect(await readSessionToken(token)).toMatchObject(session);
  });

  it("rejects a tampered or foreign token", async () => {
    const token = await createSessionToken(session);
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...session, governanceRoleAtSignIn: "admin" })).toString("base64url");
    expect(await readSessionToken(`${header}.${forged}.${signature}`)).toBeNull();
    expect(await readSessionToken("not-a-token")).toBeNull();
  });

  it("reads the member from the volsoc_session cookie (dev, no database)", async () => {
    expect(await getCurrentMember()).toBeNull();
    cookieStore["volsoc_session"] = await createSessionToken(session);
    const member = await getCurrentMember();
    expect(member?.id).toBe("member-1");
    expect(member?.governance_role).toBe("committee");
  });
});
