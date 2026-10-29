import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cache } from "react";
import { sessionSigningKey } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

/**
 * The CH&Co staff session. Staff have no UCL account, so a principal gives each
 * person an access code (Members page) and /staff swaps it for this cookie.
 *
 * As with the member session, the cookie only says who: whether they may still
 * post is read from partner_staff on every request, so revoking a code cuts
 * that person off at once. The `staff` audience keeps a staff token from ever
 * passing as a member session, and the other way round.
 */

const COOKIE_NAME = "volsoc_staff";
const AUDIENCE = "volsoc-staff";
const MAX_AGE = 60 * 60 * 24 * 90;

export interface StaffMember {
  id: string;
  name: string;
  organisation: string;
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export async function setStaffCookie(staffId: string): Promise<void> {
  const token = await new SignJWT({ staffId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(sessionSigningKey());
  (await cookies()).set(COOKIE_NAME, token, cookieOptions(MAX_AGE));
}

export async function clearStaffCookie(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, "", cookieOptions(0));
}

async function staffIdFromCookie(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSigningKey(), { audience: AUDIENCE });
    return typeof payload.staffId === "string" ? payload.staffId : null;
  } catch {
    return null;
  }
}

/** The staff member behind the cookie, if their code hasn't been revoked. Memoised per request. */
export const getCurrentStaff = cache(async (): Promise<StaffMember | null> => {
  if (!isSupabaseConfigured()) return null;
  const id = await staffIdFromCookie();
  if (!id) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("partner_staff")
    .select("id,name,organisation")
    .eq("id", id)
    .is("revoked_at", null)
    .maybeSingle<StaffMember>();
  return error ? null : data;
});

export type StaffAuth = { staff: StaffMember; error?: undefined } | { staff?: undefined; error: NextResponse };

/** For a route handler: the signed-in staff member, or the 401 to return instead. */
export async function requireApiStaff(): Promise<StaffAuth> {
  const staff = await getCurrentStaff();
  if (!staff) return { error: NextResponse.json({ error: "Sign in with your access code first" }, { status: 401 }) };
  return { staff };
}
