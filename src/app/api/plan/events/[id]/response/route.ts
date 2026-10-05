import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { parseResponse, setResponse } from "@/lib/plan";
import { requireApiCapability } from "@/lib/session";
import { errorResponse, needsDatabase, readJson } from "../../../http";

type Params = { params: Promise<{ id: string }> };

/** `{ response: "going" | "maybe" | "no" | null }` for the caller's own answer → `{ ok: true }`. */
export async function PUT(request: Request, { params }: Params) {
  const auth = await requireApiCapability("view_plan");
  if (auth.error) return auth.error;
  const unavailable = needsDatabase();
  if (unavailable) return unavailable;
  const { body, error } = await readJson(request);
  if (error) return error;
  const parsed = parseResponse(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const id = (await params).id;
    await setResponse(id, auth.member.id, parsed.value);
    await audit(auth.member.id, "plan.response.set", "event", id, { response: parsed.value });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
