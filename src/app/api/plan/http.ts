import { NextResponse } from "next/server";
import { PlanError } from "@/lib/plan";
import { isSupabaseConfigured } from "@/lib/supabase";

/** Shared by the /api/plan routes. Not a route itself: only `route.ts` is. */

/** 503 when there is no database to plan in, else null. */
export function needsDatabase(): NextResponse | null {
  return isSupabaseConfigured() ? null : NextResponse.json({ error: "The plan needs the database." }, { status: 503 });
}

/** The request body as JSON, or the 400 to send instead. */
export async function readJson(request: Request): Promise<{ body: unknown; error?: undefined } | { body?: undefined; error: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { error: NextResponse.json({ error: "Send the body as JSON." }, { status: 400 }) };
  }
}

/** A `PlanError` as its status; anything else as a logged 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof PlanError) {
    if (error.status === 500) console.error(`[plan] ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[plan]", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
