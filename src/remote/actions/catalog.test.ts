import { actionCatalog, canPlaceAction, searchActions } from "./catalog";
import { sectionDefinitions } from "@/layouts/sections";
it("defines every default action exactly once", () => {
  expect(new Set(actionCatalog.map((action) => action.id)).size).toBe(
    actionCatalog.length,
  );
  for (const sections of Object.values(sectionDefinitions))
    for (const section of Object.values(sections))
      for (const group of section.groups)
        for (const id of group.ids)
          expect(
            actionCatalog.filter((action) => action.id === id),
          ).toHaveLength(1);
});
it("permits cross-surface actions but reserves draft operations for Typing", () => {
  expect(canPlaceAction("key.Enter", "mouse")).toBe(true);
  expect(canPlaceAction("move.0.0", "window")).toBe(true);
  expect(canPlaceAction("modifier.Meta", "typing")).toBe(true);
  expect(canPlaceAction("draft.send", "typing")).toBe(true);
  expect(canPlaceAction("draft.clear", "window")).toBe(false);
  expect(canPlaceAction("draft.send", "mouse")).toBe(false);
  expect(canPlaceAction("unrecognized", "mouse")).toBe(false);
});
it("searches names, categories and aliases without confusing pointer directions with keys", () => {
  expect(
    searchActions(actionCatalog, "  ARROW UP ").map((action) => action.id),
  ).toEqual(["key.ArrowUp"]);
  expect(
    searchActions(actionCatalog, "pointer up").map((action) => action.id),
  ).toContain("move.1.0");
  expect(
    searchActions(actionCatalog, "pointer up").map((action) => action.id),
  ).not.toContain("key.ArrowUp");
  expect(
    searchActions(actionCatalog, "command").map((action) => action.id),
  ).toContain("modifier.Meta");
  expect(
    searchActions(actionCatalog, "wheel").map((action) => action.id),
  ).toEqual(["scroll.up", "scroll.down"]);
  expect(searchActions(actionCatalog, "no such action")).toEqual([]);
});
