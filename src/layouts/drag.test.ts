import { dropTarget, type Rect } from "./drag";
const viewport = { x: 10, y: 20, width: 230, height: 320 };
const rects = new Map<string, Rect>();
for (let i = 0; i < 6; i++)
  rects.set(`cell-${i}`, {
    x: 20 + (i % 2) * 100,
    y: 30 + Math.floor(i / 2) * 100,
    width: 90,
    height: 90,
  });
it("finds button targets and rejects clipped or off-grid drops", () => {
  expect(
    dropTarget({ kind: "cell", index: 0 }, 150, 50, viewport, rects, 2),
  ).toEqual({ index: 1 });
  expect(
    dropTarget({ kind: "cell", index: 0 }, 115, 50, viewport, rects, 2),
  ).toBeNull();
  expect(
    dropTarget(
      { kind: "cell", index: 0 },
      50,
      50,
      { ...viewport, y: 80 },
      rects,
      2,
    ),
  ).toBeNull();
});
it("uses before/after boundaries when moving tracks in either direction", () => {
  expect(
    dropTarget({ kind: "row", index: 0 }, 50, 180, viewport, rects, 2),
  ).toEqual({ index: 1, boundary: 2 });
  expect(
    dropTarget({ kind: "row", index: 2 }, 50, 50, viewport, rects, 2),
  ).toEqual({ index: 0, boundary: 0 });
  expect(
    dropTarget({ kind: "column", index: 0 }, 180, 50, viewport, rects, 2),
  ).toEqual({ index: 1, boundary: 2 });
  expect(
    dropTarget({ kind: "column", index: 1 }, 30, 50, viewport, rects, 2),
  ).toEqual({ index: 0, boundary: 0 });
});
