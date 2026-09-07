import AsyncStorage from "@react-native-async-storage/async-storage";
import { LayoutStore } from "./LayoutStore";
import { initialLayout } from "./model";
const click = initialLayout(["click.double"]);
const speed = initialLayout(["speed.slower"]);
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});
it("persists and resets only the chosen section, including queued independent saves", async () => {
  const store = new LayoutStore();
  await Promise.all([
    store.save("mouse", "clicks", click),
    store.save("mouse", "speed", speed),
    store.save("typing", "keys", initialLayout(["key.Enter"])),
  ]);
  const restarted = new LayoutStore();
  await restarted.load();
  expect(restarted.snapshot()).toEqual(store.snapshot());
  await restarted.save("mouse", "speed", null);
  expect(restarted.snapshot()).toEqual({
    mouse: { clicks: click },
    typing: { keys: initialLayout(["key.Enter"]) },
  });
});
it("keeps the saved value after a storage failure and permits retry", async () => {
  const store = new LayoutStore();
  await store.save("mouse", "clicks", click);
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error("private details"));
  await expect(store.save("mouse", "speed", speed)).rejects.toThrow();
  expect(store.snapshot()).toEqual({ mouse: { clicks: click } });
  await store.save("mouse", "speed", speed);
  expect(store.snapshot().mouse?.speed).toEqual(speed);
});
it("ignores v1 layouts without altering other storage", async () => {
  const legacy = JSON.stringify({ version: 1, layouts: { mouse: click } });
  await AsyncStorage.setItem("switchify.remote.layouts.v1", legacy);
  await AsyncStorage.setItem("unrelated.preference", "preserved");
  const store = new LayoutStore();
  await store.load();
  expect(store.snapshot()).toEqual({});
  await store.save("mouse", "speed", speed);
  expect(await AsyncStorage.getItem("unrelated.preference")).toBe("preserved");
  expect(await AsyncStorage.getItem("switchify.remote.layouts.v1")).toBe(
    legacy,
  );
});
it("falls back independently for bad sections, duplicate IDs and foreign buttons", async () => {
  await AsyncStorage.setItem(
    "switchify.remote.layouts.v2",
    JSON.stringify({
      version: 2,
      layouts: {
        mouse: {
          speed,
          clicks: { columns: 1, cells: ["click.double", "click.double"] },
          movement: initialLayout(["draft.clear"]),
          unknown: speed,
        },
        typing: { keys: initialLayout(["key.Enter"]) },
      },
    }),
  );
  const store = new LayoutStore();
  await store.load();
  expect(store.snapshot()).toEqual({
    mouse: { speed },
    typing: { keys: initialLayout(["key.Enter"]) },
  });
  await expect(
    store.save("mouse", "speed", initialLayout(["draft.clear"])),
  ).rejects.toThrow("Invalid section layout");
  await expect(store.save("mouse", "unknown", null)).rejects.toThrow(
    "Invalid section layout",
  );
});
it.each(["{", '{"version":1,"layouts":{}}', '{"version":2,"layouts":null}'])(
  "falls back for invalid storage %s",
  async (raw) => {
    await AsyncStorage.setItem("switchify.remote.layouts.v2", raw);
    const store = new LayoutStore();
    await store.load();
    expect(store.snapshot()).toEqual({});
  },
);
it("snapshots caller data before an asynchronous write", async () => {
  const store = new LayoutStore();
  const layout = initialLayout(["click.double"]);
  const pending = store.save("mouse", "clicks", layout);
  layout.cells[0] = "key.Enter";
  await pending;
  expect(store.snapshot().mouse?.clicks).toEqual(click);
});
it("retains previous v2 grids and cross-surface actions through restart with duplicates allowed only across sections", async () => {
  const layouts = {
    mouse: {
      movement: { columns: 3, cells: ["move.0.0", "move.1.0", null] },
      clicks: { columns: 1, cells: ["key.Enter", null, "monitor.left"] },
    },
    window: { windows: { columns: 2, cells: ["key.Enter", "scroll.up"] } },
    typing: {
      keys: { columns: 1, cells: ["draft.send", "window.closeFocused"] },
    },
  };
  await AsyncStorage.setItem(
    "switchify.remote.layouts.v2",
    JSON.stringify({ version: 2, layouts }),
  );
  const store = new LayoutStore();
  await store.load();
  expect(store.snapshot()).toEqual(layouts);
  await store.save("mouse", "speed", { columns: 1, cells: ["key.Enter"] });
  const restarted = new LayoutStore();
  await restarted.load();
  expect(restarted.snapshot()).toEqual({
    ...layouts,
    mouse: { ...layouts.mouse, speed: { columns: 1, cells: ["key.Enter"] } },
  });
});
