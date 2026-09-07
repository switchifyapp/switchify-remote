import { sectionDefault, getSection, validSectionLayout } from "./sections";
it("captures responsive rows in each section instead of flattening the surface", () => {
  expect(sectionDefault(getSection("mouse", "clicks")!, 460, 1, 8)).toEqual({
    columns: 3,
    cells: [
      "click.double",
      "click.right",
      "drag.toggle",
      "scroll.up",
      "scroll.down",
      null,
    ],
  });
  expect(sectionDefault(getSection("mouse", "clicks")!, 300, 1, 8)).toEqual({
    columns: 2,
    cells: [
      "click.double",
      "click.right",
      "drag.toggle",
      null,
      "scroll.up",
      "scroll.down",
    ],
  });
  expect(
    sectionDefault(getSection("mouse", "movement")!, 300, 2, 8).columns,
  ).toBe(3);
});
it("accepts catalog actions across sections but enforces placement restrictions", () => {
  expect(
    validSectionLayout("mouse", "clicks", {
      columns: 1,
      cells: ["click.double"],
    }),
  ).toBe(true);
  expect(validSectionLayout("mouse", "speed", { columns: 1, cells: ["click.double"] })).toBe(true);
  expect(validSectionLayout("window", "modifiers", { columns: 1, cells: ["key.Enter"] })).toBe(true);
  expect(validSectionLayout("window", "modifiers", { columns: 1, cells: ["draft.clear"] })).toBe(false);
  expect(getSection("mouse", "__proto__")).toBeUndefined();
});
