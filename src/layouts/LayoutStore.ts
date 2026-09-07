import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ButtonLayout, type LayoutSurface, validLayout } from "./model";

const KEY = "switchify.remote.layouts.v1";
type Layouts = Partial<Record<LayoutSurface, ButtonLayout>>;
export class LayoutStore {
  #value: Layouts = {};
  #listeners = new Set<() => void>();
  #loading: Promise<void> | null = null;
  #queue: Promise<void> = Promise.resolve();
  snapshot = () => this.#value;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  load(): Promise<void> {
    return (this.#loading ??= (async () => {
      try {
        const text = await AsyncStorage.getItem(KEY);
        const parsed: unknown =
          text && text.length <= 32_000 ? JSON.parse(text) : null;
        if (
          parsed &&
          typeof parsed === "object" &&
          "version" in parsed &&
          parsed.version === 1 &&
          "layouts" in parsed &&
          parsed.layouts &&
          typeof parsed.layouts === "object"
        ) {
          const layouts = parsed.layouts;
          for (const surface of ["mouse", "typing", "window"] as const) {
            const value =
              surface in layouts
                ? layouts[surface as keyof typeof layouts]
                : null;
            if (validLayout(value))
              this.#value = { ...this.#value, [surface]: value };
          }
        }
      } catch {
        /* Invalid or unavailable local storage leaves default layouts. */
      }
      this.#listeners.forEach((listener) => listener());
    })());
  }
  async save(
    surface: LayoutSurface,
    layout: ButtonLayout | null,
  ): Promise<void> {
    if (layout !== null && !validLayout(layout))
      throw new Error("Invalid layout");
    const snapshot = layout
      ? { columns: layout.columns, cells: [...layout.cells] }
      : null;
    await this.load();
    const write = this.#queue
      .catch(() => undefined)
      .then(async () => {
        const next = { ...this.#value };
        if (snapshot) next[surface] = snapshot;
        else delete next[surface];
        await AsyncStorage.setItem(
          KEY,
          JSON.stringify({ version: 1, layouts: next }),
        );
        this.#value = next;
        this.#listeners.forEach((listener) => listener());
      });
    this.#queue = write;
    return write;
  }
}
export const layoutStore = new LayoutStore();
