import { describe, expect, it } from "vitest";
import {
  isLive,
  parseCollectionPost,
  pushMessage,
  whatsappLink,
  whatsappText,
} from "./collections";

const post = { outlet: " Cruciform  Cafe ", what: "12 sandwiches and a tray of brownies", minutes: 120 };

describe("collection posts", () => {
  it("cleans the outlet and keeps a blank note as none", () => {
    expect(parseCollectionPost({ ...post, note: "  " }).value).toEqual({
      outlet: "Cruciform Cafe",
      what: "12 sandwiches and a tray of brownies",
      note: null,
      minutes: 120,
    });
  });

  it("refuses a missing outlet, nothing to collect, or a window it doesn't offer", () => {
    expect(parseCollectionPost({ ...post, outlet: "" }).error).toMatch(/outlet/);
    expect(parseCollectionPost({ ...post, what: " " }).error).toMatch(/what there is/);
    expect(parseCollectionPost({ ...post, minutes: 45 }).error).toMatch(/how long/);
    expect(parseCollectionPost(null).error).toBeDefined();
  });
});

describe("what's live", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it("is open and not yet past its time", () => {
    expect(isLive({ status: "open", collect_by: "2026-10-29T13:00:00Z" }, now)).toBe(true);
    expect(isLive({ status: "open", collect_by: "2026-10-29T11:59:00Z" }, now)).toBe(false);
    expect(isLive({ status: "collected", collect_by: "2026-10-29T13:00:00Z" }, now)).toBe(false);
  });
});

describe("messages", () => {
  const alert = { outlet: "Cruciform Cafe", what: "12 sandwiches", note: "Ask at the till", collect_by: "2026-10-29T14:30:00Z" };

  it("says the London time", () => {
    expect(pushMessage(alert)).toEqual({ title: "Food to collect · Cruciform Cafe", body: "12 sandwiches — there until 14:30" });
  });

  it("makes a WhatsApp message with a link, and a link that opens WhatsApp with it", () => {
    const text = whatsappText(alert, "https://uclvolunteering.org/");
    expect(text).toContain("Food to collect at Cruciform Cafe");
    expect(text).toContain("Ask at the till");
    expect(text.endsWith("https://uclvolunteering.org/zero-food-waste")).toBe(true);
    expect(whatsappLink(text).startsWith("https://wa.me/?text=")).toBe(true);
  });
});
