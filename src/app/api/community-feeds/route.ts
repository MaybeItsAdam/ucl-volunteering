import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { addManualFeed, cleanLabel, FeedError } from "@/lib/communityFeeds";
import { hexColour } from "@/lib/communityEvents";
import { requireApiCapability } from "@/lib/session";
import { needsDatabase, readJson } from "@/app/api/plan/http";

/**
 * POST /api/community-feeds — add a calendar to the public calendar:
 *   { link: string, label?: string, colour?: "#rrggbb" }
 * `link` is an iCal feed (https or webcal) or a Campus Toolbox society. Its
 * events are pulled straight away; a link that isn't a calendar is refused.
 * Answers `{ id, events }`.
 */
export async function POST(request: Request) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  const { body, error } = await readJson(request);
  if (error) return error;
  const record = (body ?? {}) as Record<string, unknown>;
  if (typeof record.link !== "string" || !record.link.trim()) {
    return NextResponse.json({ error: "Paste the calendar's link" }, { status: 400 });
  }
  try {
    const added = await addManualFeed({
      link: record.link,
      label: cleanLabel(record.label),
      colour: hexColour(record.colour),
      memberId: auth.member.id,
    });
    await audit(auth.member.id, "community_feed.add", "community_society", added.id, { link: record.link });
    revalidatePath("/calendar");
    return NextResponse.json(added, { status: 201 });
  } catch (err) {
    if (err instanceof FeedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[community-feeds]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
