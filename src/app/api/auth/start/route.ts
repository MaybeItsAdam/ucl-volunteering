import { NextResponse } from "next/server";
import { authCallbackUrl, RETURN_COOKIE, safeReturnPath } from "@/lib/authCallback";
import { getToolboxLoginUrl } from "@/lib/toolbox";

/**
 * The sign-in button: off to UCL sign-in via the Toolbox, back to /auth/callback.
 * `?next=/volunteer` comes back to that page instead of the portal; it rides in
 * a short-lived cookie, since the Toolbox only returns to the callback itself.
 *
 * `?native=1` is the phone app, which opens this in the system browser: the
 * callback then hands the token to the app (see appCallbackLink), so `next`
 * rides in the callback's own query instead, the browser's cookies being no
 * use to the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = authCallbackUrl(url);
  if (!base) return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  const next = safeReturnPath(url.searchParams.get("next"));
  const native = url.searchParams.get("native") === "1";
  const callback = new URL(base);
  if (native) {
    callback.searchParams.set("native", "1");
    if (next) callback.searchParams.set("next", next);
  }
  const response = NextResponse.redirect(getToolboxLoginUrl(callback.toString()));
  if (native) return response;
  response.cookies.set(RETURN_COOKIE, next ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: next ? 15 * 60 : 0,
  });
  return response;
}
