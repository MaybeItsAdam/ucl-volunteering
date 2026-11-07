import { NextResponse } from "next/server";
import { toolboxUrl } from "@/lib/toolbox";
import { POST as exchange } from "../exchange/route";

/**
 * Sign-in for the App Store and Play Store reviewer accounts, who have no UCL
 * login. POST { email, password }: asks the Toolbox's /api/auth/backdoor on
 * their behalf (the Toolbox holds the passwords and rate-limits attempts), then
 * hands its token to the ordinary exchange, so a reviewer is signed in exactly
 * like a UCL member with no committee role. Only the two reviewer addresses are
 * forwarded, so this can't become a general password proxy.
 */
const REVIEW_EMAILS = new Set(["apple@adamscampustoolbox.org.uk", "android@adamscampustoolbox.org.uk"]);
const invalid = () => NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password.trim() : "";
  if (!REVIEW_EMAILS.has(email) || !password || password.length > 200) return invalid();

  let res: Response;
  try {
    res = await fetch(`${toolboxUrl()}/api/auth/backdoor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return NextResponse.json({ error: "The sign-in service is unavailable" }, { status: 502 });
  }
  if (res.status === 429) return NextResponse.json({ error: "Too many attempts, try again in ten minutes" }, { status: 429 });
  if (!res.ok) return invalid();

  const token = res.headers
    .getSetCookie()
    .map((cookie) => /^user_token=([^;]+)/.exec(cookie)?.[1])
    .find(Boolean);
  if (!token) return NextResponse.json({ error: "The sign-in service returned no session" }, { status: 502 });

  return exchange(new Request(request.url, { method: "POST", body: JSON.stringify({ token: decodeURIComponent(token) }) }));
}
