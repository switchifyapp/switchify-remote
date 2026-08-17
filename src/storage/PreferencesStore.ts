import AsyncStorage from '@react-native-async-storage/async-storage';

export type RemoteSurface = 'mouse' | 'typing' | 'window';
export type TypingMode = 'live' | 'draft';
export type Preferences = { surface: RemoteSurface; typingMode: TypingMode; draft: string };

const KEY = 'switchify.remote.preferences.v1';
const defaults: Preferences = { surface: 'mouse', typingMode: 'live', draft: '' };

export class PreferencesStore {
  #value = defaults;
  #listeners = new Set<() => void>();
  #writeQueue: Promise<void> = Promise.resolve();
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#value;
  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await AsyncStorage.getItem(KEY) ?? '{}') as Partial<Preferences>;
      this.#value = {
        surface: raw.surface === 'typing' || raw.surface === 'window' ? raw.surface : 'mouse',
        typingMode: raw.typingMode === 'draft' ? 'draft' : 'live',
        draft: typeof raw.draft === 'string' ? raw.draft.slice(0, 2_000) : '',
      };
    } catch { this.#value = defaults; }
    this.#emit();
  }
  async update(patch: Partial<Preferences>): Promise<void> {
    const operation = this.#writeQueue.catch(() => undefined).then(async () => {
      const candidate = { ...this.#value, ...patch, ...(typeof patch.draft === 'string' ? { draft: patch.draft.slice(0, 2_000) } : {}) };
      await AsyncStorage.setItem(KEY, JSON.stringify(candidate));
      this.#value = candidate;
      this.#emit();
    });
    this.#writeQueue = operation;
    await operation;
  }
  #emit(): void { this.#listeners.forEach((listener) => listener()); }
}

export const preferencesStore = new PreferencesStore();
