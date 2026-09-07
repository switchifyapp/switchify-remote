import {
  initialLayout,
  moveCell,
  resizeLayout,
  setCell,
  validLayout,
} from "./model";

describe("button layout operations", () => {
  it("preserves empty cells, swaps occupied cells and moves into empty cells", () => {
    const initial = initialLayout(["a", "b"]);
    expect(initial).toEqual({ columns: 3, cells: ["a", "b", null] });
    expect(moveCell(initial, 0, 1).cells).toEqual(["b", "a", null]);
    expect(moveCell(initial, 0, 2).cells).toEqual([null, "b", "a"]);
    expect(initial.cells).toEqual(["a", "b", null]);
  });
  it("removes and restores controls without duplicates", () => {
    const layout = initialLayout(["a", "b"]);
    expect(setCell(layout, 2, "a")).toBe(layout);
    const removed = setCell(layout, 0, null);
    expect(setCell(removed, 2, "a").cells).toEqual([null, "b", "a"]);
  });
  it("inserts and removes columns without changing other row positions", () => {
    const layout = initialLayout(["a", "b", "c", "d"]);
    const inserted = resizeLayout(layout, "column", 1, true);
    expect(inserted).toEqual({
      columns: 4,
      cells: ["a", null, "b", "c", "d", null, null, null],
    });
    expect(resizeLayout(inserted, "column", 1, false)).toEqual(layout);
    expect(resizeLayout(layout, "column", 0, false)).toEqual({
      columns: 2,
      cells: ["b", "c", null, null],
    });
  });
  it("inserts and removes rows and bounds grid size", () => {
    const layout = initialLayout(["a"]);
    expect(resizeLayout(layout, "row", 0, true).cells).toEqual([
      null,
      null,
      null,
      "a",
      null,
      null,
    ]);
    expect(resizeLayout(layout, "row", 0, false)).toBe(layout);
    const full = { columns: 4, cells: Array<null>(80).fill(null) };
    expect(resizeLayout(full, "row", 20, true)).toBe(full);
    expect(resizeLayout(full, "column", 4, true)).toBe(full);
  });
  it.each([
    null,
    {},
    { columns: 0, cells: [] },
    { columns: 2, cells: ["a"] },
    { columns: 1, cells: ["a", "a"] },
    { columns: 1, cells: ["bad id"] },
    { columns: 1, cells: Array(21).fill(null) },
  ])("rejects malformed data %p", (value) =>
    expect(validLayout(value)).toBe(false),
  );
});
