import { NextResponse } from "next/server";
import { authCallbackUrl } from "@/lib/authCallback";
import { getToolboxLoginUrl } from "@/lib/toolbox";

/** The sign-in button: off to UCL sign-in via the Toolbox, back to /auth/callback. */
export async function GET(request: Request) {
  const callback = authCallbackUrl(new URL(request.url));
  if (!callback) return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  return NextResponse.redirect(getToolboxLoginUrl(callback));
}
