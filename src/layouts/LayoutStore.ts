import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ButtonLayout, type LayoutSurface } from "./model";
import { sectionDefinitions, validSectionLayout } from "./sections";

const KEY = "switchify.remote.layouts.v2";
type Layouts = Partial<Record<LayoutSurface, Record<string, ButtonLayout>>>;
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
          text && text.length <= 128_000 ? JSON.parse(text) : null;
        if (
          parsed &&
          typeof parsed === "object" &&
          "version" in parsed &&
          parsed.version === 2 &&
          "layouts" in parsed &&
          parsed.layouts &&
          typeof parsed.layouts === "object"
        ) {
          const layouts = parsed.layouts;
          for (const surface of ["mouse", "typing", "window"] as const) {
            const sections: unknown =
              surface in layouts
                ? layouts[surface as keyof typeof layouts]
                : null;
            if (!sections || typeof sections !== "object") continue;
            for (const section of Object.keys(sectionDefinitions[surface])) {
              const value: unknown =
                section in sections
                  ? sections[section as keyof typeof sections]
                  : null;
              if (validSectionLayout(surface, section, value))
                this.#value = {
                  ...this.#value,
                  [surface]: { ...this.#value[surface], [section]: value },
                };
            }
          }
        }
      } catch {
        /* Unavailable or malformed storage leaves original sections. */
      }
      this.#listeners.forEach((listener) => listener());
    })());
  }
  async save(
    surface: LayoutSurface,
    section: string,
    layout: ButtonLayout | null,
  ): Promise<void> {
    if (
      !Object.hasOwn(sectionDefinitions[surface], section) ||
      (layout !== null && !validSectionLayout(surface, section, layout))
    )
      throw new Error("Invalid section layout");
    const snapshot = layout
      ? { columns: layout.columns, cells: [...layout.cells] }
      : null;
    await this.load();
    const write = this.#queue
      .catch(() => undefined)
      .then(async () => {
        const sections = { ...this.#value[surface] };
        if (snapshot) sections[section] = snapshot;
        else delete sections[section];
        const next = { ...this.#value };
        if (Object.keys(sections).length) next[surface] = sections;
        else delete next[surface];
        await AsyncStorage.setItem(
          KEY,
          JSON.stringify({ version: 2, layouts: next }),
        );
        this.#value = next;
        this.#listeners.forEach((listener) => listener());
      });
    this.#queue = write;
    return write;
  }
}
export const layoutStore = new LayoutStore();
