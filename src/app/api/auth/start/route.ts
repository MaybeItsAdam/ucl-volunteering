import { NextResponse } from "next/server";
import { authCallbackUrl, RETURN_COOKIE, safeReturnPath } from "@/lib/authCallback";
import { getToolboxLoginUrl } from "@/lib/toolbox";

/**
 * The sign-in button: off to UCL sign-in via the Toolbox, back to /auth/callback.
 * `?next=/volunteer` comes back to that page instead of the portal; it rides in
 * a short-lived cookie, since the Toolbox only returns to the callback itself.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = authCallbackUrl(url);
  if (!callback) return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  const response = NextResponse.redirect(getToolboxLoginUrl(callback));
  const next = safeReturnPath(url.searchParams.get("next"));
  response.cookies.set(RETURN_COOKIE, next ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: next ? 15 * 60 : 0,
  });
  return response;
}
