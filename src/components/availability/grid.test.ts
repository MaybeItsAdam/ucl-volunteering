import { describe, expect, it } from "vitest";
import type { AvailabilityBlock } from "@/lib/types";
import {
  applyPaint,
  bestMeetingSlots,
  blocksSignature,
  blocksToCells,
  cellKey,
  cellsToBlocks,
  daySpans,
  everyoneFreeCells,
  hasCellsOutside,
  modeFor,
  overlay,
  rectangle,
  runAt,
  setNote,
  slotsIn,
  DAY_RANGE,
  WEEKDAYS,
  type BlockInput,
} from "./grid";
import { colourOf, initialsOf } from "./colours";

const H = (h: number, m = 0) => h * 60 + m;
const block = (weekday: number, start: number, end: number, note: string | null = null): BlockInput => ({
  weekday,
  startMinute: start,
  endMinute: end,
  note,
});
let nextId = 0;
const of = (memberId: string, b: BlockInput): AvailabilityBlock => ({ id: `b${nextId++}`, memberId, ...b });

describe("cells ⇄ blocks", () => {
  it("expands a block into its half-hour cells, keeping the note", () => {
    const cells = blocksToCells([block(2, H(9), H(10, 30), "Lecture")]);
    expect([...cells.entries()]).toEqual([
      ["2:540", "Lecture"],
      ["2:570", "Lecture"],
      ["2:600", "Lecture"],
    ]);
  });

  it("covers every cell an off-grid block touches", () => {
    const cells = blocksToCells([block(1, H(9, 15), H(10, 10))]);
    expect([...cells.keys()]).toEqual(["1:540", "1:570", "1:600"]);
  });

  it("merges touching cells of the same note into one block", () => {
    const cells = new Map([
      [cellKey(1, H(9)), null],
      [cellKey(1, H(9, 30)), null],
      [cellKey(1, H(10)), null],
    ]);
    expect(cellsToBlocks(cells)).toEqual([block(1, H(9), H(10, 30))]);
  });

  it("keeps runs with different notes apart, and gaps as gaps", () => {
    const cells = new Map<string, string | null>([
      [cellKey(1, H(11)), null],
      [cellKey(1, H(9)), "Lecture"],
      [cellKey(1, H(9, 30)), "Lecture"],
      [cellKey(1, H(10)), "Work"],
      [cellKey(3, H(9)), "Lecture"],
    ]);
    expect(cellsToBlocks(cells)).toEqual([
      block(1, H(9), H(10), "Lecture"),
      block(1, H(10), H(10, 30), "Work"),
      block(1, H(11), H(11, 30)),
      block(3, H(9), H(9, 30), "Lecture"),
    ]);
  });

  it("treats a blank note as none", () => {
    expect(cellsToBlocks(new Map([[cellKey(1, H(9)), "  "]]))).toEqual([block(1, H(9), H(9, 30))]);
  });

  it("round-trips grid-aligned blocks", () => {
    const blocks = [
      block(1, H(9), H(11), "Lecture"),
      block(1, H(11), H(12), "Work"),
      block(1, H(14), H(15)),
      block(5, H(8), H(20)),
      block(7, 0, 24 * 60, "Away"),
    ];
    expect(cellsToBlocks(blocksToCells(blocks))).toEqual(blocks);
  });

  it("round-trips through the server's merge: touching blocks of one note come back as one", () => {
    const blocks = [block(2, H(9), H(10), "Lab"), block(2, H(10), H(11), "Lab")];
    expect(cellsToBlocks(blocksToCells(blocks))).toEqual([block(2, H(9), H(11), "Lab")]);
  });

  it("lets a noted block win a shared cell over an un-noted one", () => {
    const cells = blocksToCells([block(1, H(9), H(10), "Lecture"), block(1, H(9, 30), H(10, 30))]);
    expect(cellsToBlocks(cells)).toEqual([block(1, H(9), H(10), "Lecture"), block(1, H(10), H(10, 30))]);
  });

  it("fingerprints equal sets equally, however they are cut", () => {
    expect(blocksSignature([block(1, H(9), H(10)), block(1, H(10), H(11))])).toBe(blocksSignature([block(1, H(9), H(11))]));
    expect(blocksSignature([block(1, H(9), H(11), "A")])).not.toBe(blocksSignature([block(1, H(9), H(11))]));
  });
});

describe("painting", () => {
  it("sweeps a rectangle across the days shown, either direction", () => {
    expect(rectangle({ weekday: 3, minute: H(10) }, { weekday: 1, minute: H(9) }, WEEKDAYS)).toEqual([
      "1:540", "1:570", "1:600",
      "2:540", "2:570", "2:600",
      "3:540", "3:570", "3:600",
    ]);
  });

  it("does not sweep a day that is not shown", () => {
    expect(rectangle({ weekday: 5, minute: H(9) }, { weekday: 6, minute: H(9) }, WEEKDAYS)).toEqual([]);
    expect(rectangle({ weekday: 5, minute: H(9) }, { weekday: 1, minute: H(9) }, [1, 5])).toEqual(["1:540", "5:540"]);
  });

  it("takes its mode from the first cell", () => {
    const cells = blocksToCells([block(1, H(9), H(10))]);
    expect(modeFor(cells, "1:540")).toBe("erase");
    expect(modeFor(cells, "1:600")).toBe("paint");
  });

  it("erases", () => {
    const cells = blocksToCells([block(1, H(9), H(11))]);
    expect(cellsToBlocks(applyPaint(cells, ["1:570", "1:600"], "erase"))).toEqual([block(1, H(9), H(9, 30)), block(1, H(10, 30), H(11))]);
  });

  it("paints, keeping the notes already there", () => {
    const cells = blocksToCells([block(1, H(9), H(10), "Lecture")]);
    const painted = applyPaint(cells, ["1:540", "1:570"], "paint");
    expect(cellsToBlocks(painted)).toEqual([block(1, H(9), H(10), "Lecture")]);
  });

  it("stretches a noted block when painting on from its edge", () => {
    const cells = blocksToCells([block(1, H(9), H(10), "Lecture")]);
    const painted = applyPaint(cells, ["1:600", "1:630", "1:660"], "paint");
    expect(cellsToBlocks(painted)).toEqual([block(1, H(9), H(11, 30), "Lecture")]);
  });

  it("leaves a painted cell un-noted with no noted neighbour", () => {
    const cells = blocksToCells([block(1, H(9), H(10), "Lecture")]);
    expect(cellsToBlocks(applyPaint(cells, ["1:660"], "paint"))).toEqual([block(1, H(9), H(10), "Lecture"), block(1, H(11), H(11, 30))]);
  });

  it("does not change the cells it was given", () => {
    const cells = blocksToCells([block(1, H(9), H(10))]);
    applyPaint(cells, ["1:540"], "erase");
    expect(cells.size).toBe(2);
  });
});

describe("notes", () => {
  const cells = blocksToCells([block(2, H(9), H(10), "Lecture"), block(2, H(10), H(11))]);

  it("finds the run a cell is in", () => {
    expect(runAt(cells, 2, H(9, 30))).toEqual(block(2, H(9), H(10), "Lecture"));
    expect(runAt(cells, 2, H(10, 30))).toEqual(block(2, H(10), H(11)));
    expect(runAt(cells, 2, H(12))).toBeNull();
  });

  it("sets a note on a run, joining it to a neighbour with the same note", () => {
    const next = setNote(cells, block(2, H(10), H(11)), "Lecture");
    expect(cellsToBlocks(next)).toEqual([block(2, H(9), H(11), "Lecture")]);
  });

  it("clears a note", () => {
    expect(cellsToBlocks(setNote(cells, block(2, H(9), H(10)), " "))).toEqual([block(2, H(9), H(11))]);
  });
});

describe("the view", () => {
  it("lists the half-hours of a range", () => {
    expect(slotsIn(DAY_RANGE)).toHaveLength(24);
    expect(slotsIn({ start: H(9), end: H(10) })).toEqual([H(9), H(9, 30)]);
  });

  it("notices marked cells outside what is shown", () => {
    expect(hasCellsOutside(blocksToCells([block(1, H(9), H(10))]), WEEKDAYS, DAY_RANGE)).toBe(false);
    expect(hasCellsOutside(blocksToCells([block(6, H(9), H(10))]), WEEKDAYS, DAY_RANGE)).toBe(true);
    expect(hasCellsOutside(blocksToCells([block(1, H(20), H(21))]), WEEKDAYS, DAY_RANGE)).toBe(true);
  });
});

describe("the committee, combined", () => {
  const ids = ["ann", "bob", "cat"];
  const blocks = [
    of("bob", block(1, H(9), H(10), "Lecture")),
    of("ann", block(1, H(9, 30), H(11))),
    of("cat", block(1, H(9), H(9, 30))),
    of("zed", block(1, H(12), H(13))), // not on the committee any more
  ];

  it("lists who is out of each cell, in member order", () => {
    const cells = overlay(blocks, ids);
    expect(cells.get("1:540")).toEqual([
      { memberId: "bob", note: "Lecture" },
      { memberId: "cat", note: null },
    ]);
    expect(cells.get("1:570")).toEqual([
      { memberId: "ann", note: null },
      { memberId: "bob", note: "Lecture" },
    ]);
    expect(cells.has("1:720")).toBe(false);
  });

  it("filters to the members asked for", () => {
    expect(overlay(blocks, ["ann"]).get("1:540")).toBeUndefined();
  });

  it("counts a member once in a cell even with overlapping blocks", () => {
    const cells = overlay([of("ann", block(1, H(9), H(10))), of("ann", block(1, H(9), H(9, 30), "Gym"))], ["ann"]);
    expect(cells.get("1:540")).toEqual([{ memberId: "ann", note: "Gym" }]);
  });

  it("splits a day into spans of the same people out", () => {
    const spans = daySpans(overlay(blocks, ids), 1, { start: H(8), end: H(12) });
    expect(spans.map((s) => [s.startMinute, s.endMinute, s.absent.map((a) => a.memberId)])).toEqual([
      [H(8), H(9), []],
      [H(9), H(9, 30), ["bob", "cat"]],
      [H(9, 30), H(10), ["ann", "bob"]],
      [H(10), H(11), ["ann"]],
      [H(11), H(12), []],
    ]);
  });

  it("marks everyone-free runs of at least an hour", () => {
    const free = everyoneFreeCells(overlay(blocks, ids), [1], { start: H(8), end: H(12) });
    expect([...free].sort()).toEqual(["1:480", "1:510", "1:660", "1:690"]);
    // Half an hour free on its own is not enough.
    const short = everyoneFreeCells(overlay([of("ann", block(1, H(8, 30), H(12)))], ids), [1], { start: H(8), end: H(12) });
    expect(short.size).toBe(0);
  });
});

describe("best meeting slots", () => {
  const ids = ["ann", "bob", "cat", "dan", "eve"];

  it("puts the slots everyone is free for first, longest first", () => {
    const blocks = [
      // Monday: everyone out but a gap 13:00–14:00.
      ...ids.map((id) => of(id, block(1, H(8), H(13)))),
      ...ids.map((id) => of(id, block(1, H(14), H(20)))),
      // Tuesday: everyone out but 15:00–17:00.
      ...ids.map((id) => of(id, block(2, H(8), H(15)))),
      ...ids.map((id) => of(id, block(2, H(17), H(20)))),
      // Wednesday to Friday: all day.
      ...ids.flatMap((id) => [3, 4, 5].map((d) => of(id, block(d, H(8), H(20))))),
    ];
    const slots = bestMeetingSlots(blocks, ids, WEEKDAYS, DAY_RANGE);
    expect(slots.map((s) => [s.weekday, s.startMinute, s.endMinute, s.free.length])).toEqual([
      [2, H(15), H(17), 5],
      [1, H(13), H(14), 5],
    ]);
    expect(slots[0].absent).toEqual([]);
  });

  it("falls back to the slots most are free for, naming who is not", () => {
    const blocks = [
      ...ids.flatMap((id) => WEEKDAYS.map((d) => of(id, block(d, H(8), H(20))))).filter((b) => !(b.memberId === "ann" || b.weekday === 3)),
      of("ann", block(1, H(8), H(20))),
      of("ann", block(2, H(8), H(20))),
      of("ann", block(4, H(8), H(20))),
      of("ann", block(5, H(8), H(20))),
      of("ann", block(3, H(8), H(12))),
      of("ann", block(3, H(13), H(20))),
    ];
    // Wednesday: four free all day; Ann only 12:00–13:00.
    const slots = bestMeetingSlots(blocks, ids, WEEKDAYS, DAY_RANGE, { limit: 3 });
    expect(slots[0]).toEqual({ weekday: 3, startMinute: H(12), endMinute: H(13), free: ids, absent: [] });
    expect(slots[1]).toMatchObject({ weekday: 3, startMinute: H(13), endMinute: H(20), absent: ["ann"] });
    expect(slots[2]).toMatchObject({ weekday: 3, startMinute: H(8), endMinute: H(12), absent: ["ann"] });
  });

  it("skips slots shorter than the meeting", () => {
    const blocks = ids.flatMap((id) => [of(id, block(1, H(8), H(12))), of(id, block(1, H(12, 30), H(20)))]);
    expect(bestMeetingSlots(blocks, ids, [1], DAY_RANGE)).toEqual([]);
  });

  it("is empty with nobody to meet", () => {
    expect(bestMeetingSlots([], [], WEEKDAYS, DAY_RANGE)).toEqual([]);
  });

  it("offers a whole free day when nobody has marked anything", () => {
    const slots = bestMeetingSlots([], ids, [1, 2], DAY_RANGE, { limit: 1 });
    expect(slots).toEqual([{ weekday: 1, startMinute: H(8), endMinute: H(20), free: ids, absent: [] }]);
  });
});

describe("colours", () => {
  it("falls back to a colour by position", () => {
    expect(colourOf({ colour: "amber" }, 0)).toBe("amber");
    expect(colourOf({ colour: null }, 0)).toBe("purple");
    expect(colourOf({ colour: null }, 7)).toBe("pink");
  });

  it("makes initials", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("Ada King Lovelace")).toBe("AL");
    expect(initialsOf("plato")).toBe("PL");
    expect(initialsOf("  ")).toBe("?");
  });
});
