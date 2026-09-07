import AsyncStorage from "@react-native-async-storage/async-storage";
import { LayoutStore } from "./LayoutStore";
import { initialLayout } from "./model";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});
it("persists layouts across restarts and resets only the chosen surface", async () => {
  const store = new LayoutStore();
  await Promise.all([
    store.save("mouse", initialLayout(["a"])),
    store.save("typing", initialLayout(["b"])),
  ]);
  const restarted = new LayoutStore();
  await restarted.load();
  expect(restarted.snapshot()).toEqual(store.snapshot());
  await restarted.save("mouse", null);
  expect(restarted.snapshot()).toEqual({ typing: initialLayout(["b"]) });
});
it("keeps the saved value after a storage failure and permits retry", async () => {
  const store = new LayoutStore();
  await store.load();
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error("private details"));
  await expect(store.save("mouse", initialLayout(["a"]))).rejects.toThrow();
  expect(store.snapshot()).toEqual({});
  await store.save("mouse", initialLayout(["a"]));
  expect(store.snapshot().mouse).toEqual(initialLayout(["a"]));
});
it.each([
  "{",
  '{"version":2,"layouts":{}}',
  '{"version":1,"layouts":{"mouse":{"columns":1,"cells":["a","a"]}}}',
])("falls back for invalid storage %s", async (raw) => {
  await AsyncStorage.setItem("switchify.remote.layouts.v1", raw);
  const store = new LayoutStore();
  await store.load();
  expect(store.snapshot()).toEqual({});
});
