import AsyncStorage from '@react-native-async-storage/async-storage';

export const FIRST_RUN_SETUP_KEY = 'switchify.remote.first-run-setup.v1';

export type FirstRunSetupPhase =
  'loading' | 'welcome' | 'bluetooth' | 'complete';

type SetupStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export class FirstRunSetupStore {
  #phase: FirstRunSetupPhase = 'loading';
  #listeners = new Set<() => void>();
  #loadPromise: Promise<void> | null = null;

  constructor(private readonly storage: SetupStorage = AsyncStorage) {}

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  snapshot = () => this.#phase;

  async load(): Promise<void> {
    if (this.#phase !== 'loading') return;
    this.#loadPromise ??= (async () => {
      let complete = false;
      try {
        const value: unknown = JSON.parse(
          (await this.storage.getItem(FIRST_RUN_SETUP_KEY)) ?? 'null',
        );
        complete = Boolean(
          value &&
          typeof value === 'object' &&
          (value as { version?: unknown }).version === 1 &&
          (value as { complete?: unknown }).complete === true,
        );
      } catch {
        complete = false;
      }
      this.#set(complete ? 'complete' : 'welcome');
    })();
    await this.#loadPromise;
  }

  showBluetooth(): void {
    if (this.#phase === 'welcome') this.#set('bluetooth');
  }

  showWelcome(): void {
    if (this.#phase === 'bluetooth') this.#set('welcome');
  }

  async complete(): Promise<void> {
    if (this.#phase === 'complete') return;
    await this.storage.setItem(
      FIRST_RUN_SETUP_KEY,
      JSON.stringify({ version: 1, complete: true }),
    );
    this.#set('complete');
  }

  #set(phase: FirstRunSetupPhase): void {
    if (phase === this.#phase) return;
    this.#phase = phase;
    this.#listeners.forEach((listener) => listener());
  }
}

export const firstRunSetupStore = new FirstRunSetupStore();
