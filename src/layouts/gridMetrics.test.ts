import { sectionGridMetrics } from "./gridMetrics";

it.each([280, 296, 320, 350, 390, 600, 960])(
  "fits 1–4 saved/editor columns in %s points",
  (width) => {
    for (const columns of [1, 2, 3, 4])
      for (const handles of [0, 48]) {
        const result = sectionGridMetrics(width, columns, 8, handles);
        expect(result.cellWidth).toBeGreaterThanOrEqual(48);
        expect(result.gridWidth).toBeLessThanOrEqual(width);
        expect(result.overflows).toBe(false);
      }
  },
);
it("preserves 48-point targets and geometry when scrolling is necessary", () => {
  expect(sectionGridMetrics(200, 4, 8, 48)).toEqual({
    cellWidth: 48,
    gridWidth: 272,
    overflows: true,
  });
  expect(sectionGridMetrics(215, 4, 8)).toEqual({
    cellWidth: 48,
    gridWidth: 216,
    overflows: true,
  });
});
it("does not overflow due to fractional viewport rounding", () => {
  const result = sectionGridMetrics(295.6, 3, 8, 48);
  expect(result.gridWidth).toBeLessThanOrEqual(295.6);
  expect(295.6 - result.gridWidth).toBeLessThan(3);
});
it("handles the initial unmeasured viewport without zero-sized targets", () => {
  expect(sectionGridMetrics(0, 3, 8).cellWidth).toBe(48);
});
