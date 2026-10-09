import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { FeedError, removeManualFeed } from "@/lib/communityFeeds";
import { requireApiCapability } from "@/lib/session";
import { needsDatabase } from "@/app/api/plan/http";

/** DELETE /api/community-feeds/:id — take a hand-added calendar off the public calendar. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const noDb = needsDatabase();
  if (noDb) return noDb;
  const { id } = await params;
  try {
    await removeManualFeed(id);
    await audit(auth.member.id, "community_feed.remove", "community_society", id);
    revalidatePath("/calendar");
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof FeedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[community-feeds]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
