import { NextResponse } from "next/server";
import { nearestStation } from "@/lib/directoryAutofill";
import { requireApiCapability } from "@/lib/session";

/** GET ?postcode= → { station }: the editor's "find" button beside Nearest station. */
export async function GET(request: Request) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const postcode = new URL(request.url).searchParams.get("postcode")?.trim() ?? "";
  if (!/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(postcode)) return NextResponse.json({ error: "Add a full postcode first" }, { status: 400 });
  const station = await nearestStation(postcode);
  return station ? NextResponse.json({ station }) : NextResponse.json({ error: "Couldn't find a station near there" }, { status: 404 });
}
