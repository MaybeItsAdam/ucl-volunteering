import { describe, expect, it } from "vitest";
import {
  mergeBlocks,
  parseAvailability,
  parseEventCreate,
  parseEventPatch,
  parseRange,
  parseResponse,
  rowToEvent,
} from "./plan";

const LEAD = "6f1c1c3e-0e0b-4a8e-9a55-0d1f2b3c4d5e";

describe("parseEventCreate", () => {
  const base = {
    title: "  Litter pick  ",
    startsAt: "2026-10-24T10:00:00+01:00",
    endsAt: "2026-10-24T12:00:00+01:00",
    category: "volunteering",
  };

  it("builds a provisional VolSoc row", () => {
    const parsed = parseEventCreate(base);
    expect(parsed).toEqual({
      ok: true,
      value: {
        source: "volsoc",
        status: "provisional",
        title: "Litter pick",
        starts_at: "2026-10-24T09:00:00.000Z",
        ends_at: "2026-10-24T11:00:00.000Z",
        category: "volunteering",
      },
    });
  });

  it("takes the optional fields, camel or snake case", () => {
    const parsed = parseEventCreate({
      ...base,
      status: "confirmed",
      lead_member_id: LEAD.toUpperCase(),
      planDocUrl: "https://docs.google.com/document/d/x",
      targetVolunteers: 12,
      notes: "  ",
      location: "Gordon Square",
    });
    expect(parsed.ok && parsed.value).toMatchObject({
      status: "confirmed",
      lead_member_id: LEAD,
      plan_doc_url: "https://docs.google.com/document/d/x",
      target_volunteers: 12,
      notes: null,
      location: "Gordon Square",
    });
  });

  it("cannot be forced to another source", () => {
    expect(parseEventCreate({ ...base, source: "social_impact" })).toEqual({ ok: false, error: "source cannot be set" });
    expect(parseEventCreate({ ...base, removedAt: null })).toMatchObject({ ok: false });
  });

  it.each([
    [{ ...base, title: "" }, "title is required"],
    [{ ...base, title: undefined }, "title is required"],
    [{ ...base, endsAt: undefined }, "endsAt is required"],
    [{ ...base, category: undefined }, "category is required"],
    [{ ...base, category: "party" }, "category must be one of social, volunteering, ucl_affiliated, external"],
    [{ ...base, status: "maybe" }, "status must be one of provisional, confirmed, cancelled"],
    [{ ...base, startsAt: "2026-10-24" }, "startsAt must be an ISO date-time"],
    [{ ...base, startsAt: "tomorrow" }, "startsAt must be an ISO date-time"],
    [{ ...base, endsAt: base.startsAt }, "endsAt must be after startsAt"],
    [{ ...base, endsAt: "2026-10-24T09:00:00+01:00" }, "endsAt must be after startsAt"],
    [{ ...base, url: "javascript:alert(1)" }, "url must be an http(s) link"],
    [{ ...base, instagramUrl: "nope" }, "instagramUrl must be a link"],
    [{ ...base, leadMemberId: "bob" }, "leadMemberId must be an id"],
    [{ ...base, targetVolunteers: -1 }, "targetVolunteers must be a whole number, 0 or more"],
    [{ ...base, actualAttendance: 2.5 }, "actualAttendance must be a whole number, 0 or more"],
    [{ ...base, allDay: "yes" }, "allDay must be true or false"],
    [{ ...base, title: "x".repeat(201) }, "title must be at most 200 characters"],
    [[], "Body must be a JSON object"],
    [null, "Body must be a JSON object"],
  ])("refuses %#", (body, error) => {
    expect(parseEventCreate(body)).toEqual({ ok: false, error });
  });
});

describe("parseEventPatch", () => {
  it("lets a VolSoc event move", () => {
    expect(parseEventPatch({ startsAt: "2026-10-24T11:00:00Z", endsAt: "2026-10-24T13:00:00Z" }, "volsoc")).toEqual({
      ok: true,
      value: { starts_at: "2026-10-24T11:00:00.000Z", ends_at: "2026-10-24T13:00:00.000Z" },
    });
  });

  it("lets the committee's fields on a Social Impact event change", () => {
    expect(
      parseEventPatch(
        { category: "external", status: "confirmed", leadMemberId: null, recapUrl: "https://instagram.com/p/x", actual_attendance: 30 },
        "social_impact",
      ),
    ).toEqual({
      ok: true,
      value: { category: "external", status: "confirmed", lead_member_id: null, recap_url: "https://instagram.com/p/x", actual_attendance: 30 },
    });
  });

  it("keeps the feed's fields on a Social Impact event", () => {
    expect(parseEventPatch({ startsAt: "2026-10-24T11:00:00Z", notes: "x" }, "social_impact")).toEqual({
      ok: false,
      error: "startsAt comes from the Social Impact calendar on the Toolbox and can't be changed here",
    });
    expect(parseEventPatch({ title: "x", location: "y" }, "social_impact")).toEqual({
      ok: false,
      error: "title, location come from the Social Impact calendar on the Toolbox and can't be changed here",
    });
  });

  it("refuses an empty patch and unknown fields", () => {
    expect(parseEventPatch({}, "volsoc")).toEqual({ ok: false, error: "Nothing to change" });
    expect(parseEventPatch({ id: "x" }, "volsoc")).toEqual({ ok: false, error: "id cannot be set" });
    expect(parseEventPatch({ title: "  " }, "volsoc")).toEqual({ ok: false, error: "title is required" });
  });
});

describe("parseResponse", () => {
  it("accepts the three answers and null", () => {
    expect(parseResponse({ response: "going" })).toEqual({ ok: true, value: "going" });
    expect(parseResponse({ response: null })).toEqual({ ok: true, value: null });
  });
  it("refuses anything else", () => {
    expect(parseResponse({ response: "yes" }).ok).toBe(false);
    expect(parseResponse({}).ok).toBe(false);
    expect(parseResponse("going").ok).toBe(false);
  });
});

describe("availability", () => {
  it("validates, sorts and merges painted cells", () => {
    const parsed = parseAvailability({
      blocks: [
        { weekday: 2, startMinute: 600, endMinute: 630 },
        { weekday: 1, startMinute: 540, endMinute: 570 },
        { weekday: 1, startMinute: 570, endMinute: 600 },
        { weekday: 1, startMinute: 590, endMinute: 660, note: null },
        { weekday: 1, startMinute: 700, endMinute: 760, note: " Lab " },
        { weekday: 1, startMinute: 720, endMinute: 780 },
      ],
    });
    expect(parsed).toEqual({
      ok: true,
      value: [
        { weekday: 1, startMinute: 540, endMinute: 660, note: null },
        { weekday: 1, startMinute: 700, endMinute: 760, note: "Lab" },
        { weekday: 1, startMinute: 720, endMinute: 780, note: null },
        { weekday: 2, startMinute: 600, endMinute: 630, note: null },
      ],
    });
  });

  it("accepts an empty week", () => {
    expect(parseAvailability({ blocks: [] })).toEqual({ ok: true, value: [] });
  });

  it.each([
    [{}, "blocks must be a list"],
    [{ blocks: [{ weekday: 0, startMinute: 0, endMinute: 30 }] }, "blocks[0].weekday must be 1 (Monday) to 7 (Sunday)"],
    [{ blocks: [{ weekday: 8, startMinute: 0, endMinute: 30 }] }, "blocks[0].weekday must be 1 (Monday) to 7 (Sunday)"],
    [{ blocks: [{ weekday: 1, startMinute: -1, endMinute: 30 }] }, "blocks[0].startMinute must be a whole number from 0 to 1439"],
    [{ blocks: [{ weekday: 1, startMinute: 0, endMinute: 1441 }] }, "blocks[0].endMinute must be a whole number from 1 to 1440"],
    [{ blocks: [{ weekday: 1, startMinute: 60, endMinute: 60 }] }, "blocks[0].endMinute must be after startMinute"],
    [{ blocks: [{ weekday: 1, startMinute: 1.5, endMinute: 60 }] }, "blocks[0].startMinute must be a whole number from 0 to 1439"],
    [{ blocks: [{ weekday: 1, startMinute: 0, endMinute: 60, note: 3 }] }, "blocks[0].note must be text up to 200 characters"],
    [{ blocks: ["x"] }, "blocks[0] must be an object"],
  ])("refuses %#", (body, error) => {
    expect(parseAvailability(body)).toEqual({ ok: false, error });
  });

  it("merges without mutating its input", () => {
    const input = [
      { weekday: 3, startMinute: 0, endMinute: 30, note: null },
      { weekday: 3, startMinute: 30, endMinute: 60, note: null },
    ];
    expect(mergeBlocks(input)).toEqual([{ weekday: 3, startMinute: 0, endMinute: 60, note: null }]);
    expect(input[0].endMinute).toBe(30);
  });
});

describe("parseRange", () => {
  it("reads a week", () => {
    const r = parseRange("2026-10-19T00:00:00+01:00", "2026-10-26T00:00:00Z");
    expect(r.ok && r.value.from.toISOString()).toBe("2026-10-18T23:00:00.000Z");
  });
  it("refuses missing, backwards and huge ranges", () => {
    expect(parseRange(null, "2026-10-26T00:00:00Z").ok).toBe(false);
    expect(parseRange("x", "2026-10-26T00:00:00Z").ok).toBe(false);
    expect(parseRange("2026-10-26T00:00:00Z", "2026-10-19T00:00:00Z").ok).toBe(false);
    expect(parseRange("2026-01-01T00:00:00Z", "2028-01-01T00:00:00Z").ok).toBe(false);
  });
});

describe("rowToEvent", () => {
  it("maps a row to camelCase with Z times and sorted responses", () => {
    const event = rowToEvent({
      id: "e1",
      source: "social_impact",
      category: "ucl_affiliated",
      toolbox_uid: "uid@x",
      title: "Fair",
      starts_at: "2026-10-20T10:00:00+00:00",
      ends_at: "2026-10-20T13:00:00+00:00",
      all_day: false,
      location: null,
      description: null,
      url: null,
      status: "provisional",
      lead_member_id: null,
      linked_event_id: null,
      plan_doc_url: null,
      instagram_url: null,
      recap_url: null,
      notes: null,
      target_volunteers: null,
      actual_attendance: null,
      created_by: null,
      updated_at: "2026-10-03T15:00:00.123456+00:00",
      removed_at: null,
      event_responses: [
        { member_id: "b", response: "maybe" },
        { member_id: "a", response: "going" },
      ],
    });
    expect(event.startsAt).toBe("2026-10-20T10:00:00.000Z");
    expect(event.updatedAt).toBe("2026-10-03T15:00:00.123Z");
    expect(event.responses).toEqual([
      { memberId: "a", response: "going" },
      { memberId: "b", response: "maybe" },
    ]);
    expect(event).not.toHaveProperty("toolbox_uid");
  });
});
