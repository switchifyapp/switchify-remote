import AsyncStorage from '@react-native-async-storage/async-storage';

import { validateRemoteName } from '@/device/remoteName';

export type RemoteSurface = 'mouse' | 'typing' | 'window' | 'forwarding';
export type TypingMode = 'live' | 'draft';
export type Preferences = { surface: RemoteSurface; typingMode: TypingMode; draft: string; forwardingHoldToStopMs: number; forwardingProfiles: Record<string, string>; remoteName: string | null };

const KEY = 'switchify.remote.preferences.v1';
const defaults: Preferences = { surface: 'mouse', typingMode: 'live', draft: '', forwardingHoldToStopMs: 5_000, forwardingProfiles: {}, remoteName: null };

export class PreferencesStore {
  #value = defaults;
  #listeners = new Set<() => void>();
  #writeQueue: Promise<void> = Promise.resolve();
  #loadPromise: Promise<void> | null = null;
  #loaded = false;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#value;
  async load(): Promise<void> {
    if (this.#loaded) return;
    if (!this.#loadPromise) {
      this.#loadPromise = (async () => {
        try {
          const raw = JSON.parse(await AsyncStorage.getItem(KEY) ?? '{}') as Partial<Preferences>;
          const remoteName = typeof raw.remoteName === 'string' ? validateRemoteName(raw.remoteName) : null;
          this.#value = {
            surface: raw.surface === 'typing' || raw.surface === 'window' || raw.surface === 'forwarding' ? raw.surface : 'mouse',
            typingMode: raw.typingMode === 'draft' ? 'draft' : 'live',
            draft: typeof raw.draft === 'string' ? raw.draft.slice(0, 2_000) : '',
            forwardingHoldToStopMs: [3_000, 5_000, 8_000].includes(raw.forwardingHoldToStopMs ?? 0) ? raw.forwardingHoldToStopMs! : 5_000,
            forwardingProfiles: raw.forwardingProfiles && typeof raw.forwardingProfiles === 'object' && !Array.isArray(raw.forwardingProfiles)
              ? Object.fromEntries(Object.entries(raw.forwardingProfiles).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
              : {},
            remoteName: remoteName?.valid ? remoteName.value : null,
          };
        } catch { this.#value = defaults; }
        this.#loaded = true;
        this.#emit();
      })();
    }
    await this.#loadPromise;
  }
  async update(patch: Partial<Preferences>): Promise<void> {
    await this.load();
    let normalizedRemoteName: string | null | undefined;
    if (Object.prototype.hasOwnProperty.call(patch, 'remoteName')) {
      if (patch.remoteName === null) normalizedRemoteName = null;
      else {
        const validation = validateRemoteName(patch.remoteName ?? '');
        if (!validation.valid) throw new Error(validation.error);
        normalizedRemoteName = validation.value;
      }
    }
    const operation = this.#writeQueue.catch(() => undefined).then(async () => {
      const candidate = { ...this.#value, ...patch, ...(normalizedRemoteName !== undefined ? { remoteName: normalizedRemoteName } : {}), ...(typeof patch.draft === 'string' ? { draft: patch.draft.slice(0, 2_000) } : {}) };
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
