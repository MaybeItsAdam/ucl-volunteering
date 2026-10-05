import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IcalEvent } from "./ical";
import { parseIcal } from "./ical";
import { feedFields, organiserFeedUrl, planFeedSync, safeUrl, type ExistingFeedRow } from "./toolboxEvents";

const feed = parseIcal(readFileSync(new URL("./__fixtures__/organiser-feed.ics", import.meta.url), "utf8"));
const NOW = new Date("2026-10-03T12:00:00Z");

function event(uid: string, start: string, extra: Partial<IcalEvent> = {}): IcalEvent {
  return {
    uid,
    title: uid,
    description: null,
    location: null,
    url: null,
    start: new Date(start),
    end: new Date(new Date(start).getTime() + 3_600_000),
    allDay: false,
    cancelled: false,
    ...extra,
  };
}

function stored(e: IcalEvent, extra: Partial<ExistingFeedRow> = {}): ExistingFeedRow {
  return { id: `row-${e.uid}`, toolbox_uid: e.uid, status: "confirmed", removed_at: null, ...feedFields(e), ...extra };
}

describe("feed URL", () => {
  it("defaults to the Social Impact organiser", () => {
    expect(organiserFeedUrl({})).toBe("https://www.adamscampustoolbox.org.uk/api/organiser/org_uni_juev5rp0v/ical");
  });
  it("follows the environment", () => {
    expect(organiserFeedUrl({ TOOLBOX_URL: "http://localhost:3000/", CALENDAR_ORGANISER_ID: "org_x" })).toBe(
      "http://localhost:3000/api/organiser/org_x/ical",
    );
  });
});

describe("feedFields", () => {
  it("maps a live event", () => {
    expect(feedFields(feed[0])).toMatchObject({
      title: "UCL East Volunteering Fair",
      starts_at: "2026-10-20T10:00:00.000Z",
      ends_at: "2026-10-20T13:00:00.000Z",
      all_day: false,
      location: "Marshgate Building, UCL East Campus",
      url: "https://studentsunionucl.org/whats-on/volunteering/ucl-east-volunteering-fair-0?v=95152",
    });
  });
  it("gives an endless event an hour and refuses non-web links", () => {
    const f = feedFields(event("x", "2026-10-20T10:00:00Z", { end: null, url: "javascript:alert(1)", title: "  " }));
    expect(f.ends_at).toBe("2026-10-20T11:00:00.000Z");
    expect(f.url).toBeNull();
    expect(f.title).toBe("Untitled event");
  });
  it("safeUrl", () => {
    expect(safeUrl("https://a.example/x")).toBe("https://a.example/x");
    expect(safeUrl("ftp://a.example")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});

describe("planFeedSync", () => {
  it("inserts new events as UCL-affiliated Social Impact rows", () => {
    const plan = planFeedSync(feed, [], NOW);
    expect(plan.inserts).toHaveLength(3);
    expect(plan.inserts[0]).toMatchObject({
      source: "social_impact",
      category: "ucl_affiliated",
      status: "provisional",
      toolbox_uid: "cmtyezb1100j301s6qjjmmgtd@adamscampustoolbox.org.uk",
      title: "UCL East Volunteering Fair",
    });
    expect(plan.updates).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("leaves unchanged rows alone, whatever the committee set on them", () => {
    const rows = feed.map((e) => stored(e, { status: "confirmed" }));
    const plan = planFeedSync(feed, rows, NOW);
    expect(plan).toMatchObject({ inserts: [], updates: [], remove: [], unchanged: 3 });
  });

  it("compares times as instants, not strings", () => {
    const e = event("a", "2026-10-20T10:00:00Z");
    const plan = planFeedSync([e], [stored(e, { starts_at: "2026-10-20T11:00:00+01:00", ends_at: "2026-10-20 11:00:00+00" })], NOW);
    expect(plan.unchanged).toBe(1);
  });

  it("updates only the feed-owned fields that changed", () => {
    const before = event("a", "2026-10-20T10:00:00Z", { title: "Old", location: "Room 1" });
    const after = event("a", "2026-10-21T10:00:00Z", { title: "New", location: "Room 1" });
    const plan = planFeedSync([after], [stored(before)], NOW);
    expect(plan.updates).toEqual([
      {
        id: "row-a",
        uid: "a",
        changes: { title: "New", starts_at: "2026-10-21T10:00:00.000Z", ends_at: "2026-10-21T11:00:00.000Z" },
      },
    ]);
    for (const key of ["category", "status", "lead_member_id", "notes", "source"]) {
      expect(plan.updates[0].changes).not.toHaveProperty(key);
    }
  });

  it("marks future events missing from the feed removed, and restores ones that come back", () => {
    const keep = event("keep", "2026-10-20T10:00:00Z");
    const gone = event("gone", "2026-10-25T10:00:00Z");
    const back = event("back", "2026-10-26T10:00:00Z");
    const plan = planFeedSync(
      [keep, back],
      [stored(keep), stored(gone), stored(back, { removed_at: "2026-10-01T00:00:00Z" })],
      NOW,
    );
    expect(plan.remove).toEqual(["row-gone"]);
    expect(plan.updates).toEqual([{ id: "row-back", uid: "back", changes: { removed_at: null } }]);
  });

  it("does not remove past events that have aged out of the feed's window", () => {
    const current = event("current", "2026-09-24T10:00:00Z");
    const old = event("old", "2026-06-01T10:00:00Z");
    const recentGone = event("recent-gone", "2026-09-30T10:00:00Z");
    const plan = planFeedSync([current], [stored(current), stored(old), stored(recentGone)], NOW);
    // 30 Sep is after the feed's first event (24 Sep), so the feed should have had it.
    expect(plan.remove).toEqual(["row-recent-gone"]);
  });

  it("does not mark an already-removed row again", () => {
    const keep = event("keep", "2026-10-20T10:00:00Z");
    const gone = event("gone", "2026-10-25T10:00:00Z");
    const plan = planFeedSync([keep], [stored(keep), stored(gone, { removed_at: "2026-10-02T00:00:00Z" })], NOW);
    expect(plan.remove).toEqual([]);
  });

  it("never removes anything for an empty feed", () => {
    const e = event("a", "2026-10-20T10:00:00Z");
    expect(planFeedSync([], [stored(e)], NOW).remove).toEqual([]);
  });

  it("passes on a cancellation and reports duplicate UIDs", () => {
    const a = event("a", "2026-10-20T10:00:00Z");
    const plan = planFeedSync([a, { ...a, cancelled: true }], [stored(a, { status: "confirmed" })], NOW);
    expect(plan.duplicates).toEqual(["a"]);
    expect(plan.updates).toEqual([{ id: "row-a", uid: "a", changes: { status: "cancelled" } }]);
    expect(planFeedSync([{ ...a, cancelled: true }], [], NOW).inserts[0].status).toBe("cancelled");
  });
});
