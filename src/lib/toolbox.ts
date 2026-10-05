import type { GovernanceRole } from "@/lib/access";


export interface ToolboxIdentity {
  id: string;
  email: string;
  name: string | null;
  isAdmin?: boolean;
  committeeOrganiserIds?: string[];
  principalOrganiserIds?: string[];
}

/**
 * VolSoc's own organiser on the Toolbox, whose principal and committee lists
 * grant roles here. Deliberately not the Social Impact organiser the calendar
 * comes from: its staff aren't VolSoc's committee. Unset, the Toolbox grants
 * no society roles and seats are given on the Members page instead.
 */
export function getSocietyOrganiserId(): string | null {
  return process.env.TOOLBOX_ORGANISER_ID || null;
}

export function toolboxUrl(): string {
  return (process.env.TOOLBOX_URL || "https://www.adamscampustoolbox.org.uk").replace(/\/$/, "");
}

/**
 * A global Toolbox administrator, or someone listed in ADMIN_EMAILS (comma
 * separated) as a way in before the Toolbox knows the society's officers.
 */
export function isPlatformAdmin(identity: ToolboxIdentity): boolean {
  if (identity.isAdmin) return true;
  const email = identity.email.toLowerCase();
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

/** This society's governance role, from the person's verified Toolbox identity. */
export function getSocietyGovernanceRole(identity: ToolboxIdentity): GovernanceRole | null {
  if (isPlatformAdmin(identity)) return "admin";
  const orgId = getSocietyOrganiserId();
  if (!orgId) return null;
  if (identity.principalOrganiserIds?.includes(orgId)) return "principal";
  if (identity.committeeOrganiserIds?.includes(orgId)) return "committee";
  return null;
}

export function getToolboxLoginUrl(returnTo: string): string {
  const url = new URL("/api/auth/entra", toolboxUrl());
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

async function fetchJson(url: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/**
 * Swap the token the Toolbox handed back for the identity behind it.
 * `/api/auth/status` carries the organiser roles; `/api/auth/me` is the fallback.
 */
export async function verifyToolboxToken(token: string): Promise<ToolboxIdentity | null> {
  const base = toolboxUrl();
  const body =
    (await fetchJson(`${base}/api/auth/status`, token)) ?? (await fetchJson(`${base}/api/auth/me`, token));
  if (!body || typeof body !== "object") return null;

  const user = body.user as { id?: unknown; email?: unknown; name?: unknown } | undefined;
  if (body.loggedIn !== true || typeof user?.id !== "string" || typeof user?.email !== "string") {
    return null;
  }

  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    name: typeof user.name === "string" ? user.name : null,
    isAdmin: body.isAdmin === true || body.role === "global_admin" || body.role === "admin",
    committeeOrganiserIds: stringList(body.committeeOrganiserIds),
    principalOrganiserIds: stringList(body.principalOrganiserIds),
  };
}
