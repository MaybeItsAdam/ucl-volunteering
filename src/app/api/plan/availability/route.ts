import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { listAvailability, replaceAvailability } from "@/lib/plan";
import { requireApiCapability } from "@/lib/session";
import { errorResponse, needsDatabase, readJson } from "../http";

/** Everyone's weekly unavailability → `{ blocks, members }`. */
export async function GET() {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  try {
    return NextResponse.json(await listAvailability());
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Replace the caller's own blocks: `{ blocks: { weekday, startMinute, endMinute, note? }[] }`
 * → `{ blocks }` as stored (sorted, touching cells merged).
 */
export async function PUT(request: Request) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;

  try {
    const blocks = await replaceAvailability(auth.member.id, body);
    await audit(auth.member.id, "plan.availability.replace", "member", auth.member.id, { blocks: blocks.length });
    return NextResponse.json({ blocks });
  } catch (e) {
    return errorResponse(e);
  }
}
