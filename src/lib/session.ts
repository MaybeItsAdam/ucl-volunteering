import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { can, isGovernanceRole, isMemberColour, type Capability, type GovernanceRole } from "@/lib/access";
import { MEMBER_COLUMNS, type Member } from "@/lib/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

const COOKIE_NAME = "volsoc_session";
// The cookie only proves identity: access is reloaded from the members table on
// every request, so removing someone from the committee takes effect at once.
const MAX_AGE = 60 * 60 * 24 * 90;

export interface VolsocSession {
  toolboxUserId: string;
  memberId: string;
  email: string;
  name?: string;
  /** Display history only; never authorises a request (see getCurrentMember). */
  governanceRoleAtSignIn: GovernanceRole | null;
}

// Lets `npm run dev:no-doppler` sign in with dev-login. Never used in production.
const DEV_SECRET = "volsoc-local-development-only-session-secret";

function secretValue(): string | null {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

/** Whether sessions can be signed at all; false means sign-in must refuse. */
export function isSessionSecretConfigured(): boolean {
  return secretValue() !== null;
}

function secret(): Uint8Array {
  const value = secretValue();
  if (!value) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(value);
}

export async function createSessionToken(session: VolsocSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function readSessionToken(token: string): Promise<VolsocSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.memberId || !payload.email || !payload.toolboxUserId) return null;
    return payload as unknown as VolsocSession;
  } catch {
    return null;
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export async function setSessionCookie(session: VolsocSession): Promise<void> {
  (await cookies()).set(COOKIE_NAME, await createSessionToken(session), cookieOptions(MAX_AGE));
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, "", cookieOptions(0));
}

export async function getSession(): Promise<VolsocSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? readSessionToken(token) : null;
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

/**
 * Outside production with no database, the session is the member: what
 * dev-login and a Toolbox sign-in put in it. Lets the shell run locally before
 * a Supabase project exists.
 */
function devMember(session: VolsocSession): Member {
  return {
    id: session.memberId,
    toolbox_user_id: session.toolboxUserId,
    email: session.email,
    name: session.name || session.email,
    governance_role: session.governanceRoleAtSignIn,
    governance_role_locked: false,
    colour: "purple",
    created_at: new Date(0).toISOString(),
    last_seen_at: null,
  };
}

/**
 * The member behind the session cookie, straight from the members table, or
 * null when signed out (or their row is gone). Memoised per request: the
 * shell and the page both ask.
 */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const session = await getSession();
  if (!session) return null;

  if (!isSupabaseConfigured()) {
    return process.env.NODE_ENV !== "production" ? devMember(session) : null;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("id", session.memberId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as Member;
  return {
    ...row,
    governance_role: isGovernanceRole(row.governance_role) ? row.governance_role : null,
    colour: isMemberColour(row.colour) ? row.colour : null,
  };
});

/**
 * For a Server Component page: the signed-in member, who must hold
 * `capability`. Signed out goes to sign-in; signed in without the capability
 * goes to /portal, which lands them on the first page they can use.
 */
export async function requireCapability(capability?: Capability): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) redirect("/auth/signin");
  if (capability && !can({ governanceRole: member.governance_role }, capability)) redirect("/portal");
  return member;
}

export type ApiAuth = { member: Member; error?: undefined } | { member?: undefined; error: NextResponse };

/**
 * For a route handler: the signed-in member holding `capability`, or the 401/403
 * response to return instead.
 *
 *   const auth = await requireApiCapability("edit_plan");
 *   if (auth.error) return auth.error;
 *   auth.member.id
 */
export async function requireApiCapability(capability?: Capability): Promise<ApiAuth> {
  const member = await getCurrentMember();
  if (!member) return { error: NextResponse.json({ error: "Sign in first" }, { status: 401 }) };
  if (capability && !can({ governanceRole: member.governance_role }, capability)) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  return { member };
}
