import { NextResponse } from "next/server";
import { authCallbackUrl } from "@/lib/authCallback";
import { getToolboxLoginUrl } from "@/lib/toolbox";

/** The same handoff with an explicit return address, which must be our own callback. */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = authCallbackUrl(requestUrl, requestUrl.searchParams.get("return_to"));
  if (!returnTo) return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  return NextResponse.redirect(getToolboxLoginUrl(returnTo));
}
