import { toByteArray } from 'base64-js';

/** One consuming ATT read at a time. Any failure requires a fresh connection. */
export class ReadResponsePoller {
  readonly ready: Promise<void>;
  #active = true;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #resolveReady!: () => void;
  #rejectReady!: (error: Error) => void;

  constructor(
    private readonly read: () => Promise<string | null>,
    private readonly cancelRead: () => Promise<unknown>,
    private readonly onFrame: (frame: string) => void,
    private readonly onError: (error: Error) => void,
    private readonly timeoutMs: number,
  ) {
    this.ready = new Promise<void>((resolve, reject) => { this.#resolveReady = resolve; this.#rejectReady = reject; });
    void this.ready.catch(() => undefined);
    void this.#poll();
  }

  stop(): void {
    if (!this.#active) return;
    this.#active = false;
    clearTimeout(this.#timer);
    this.#rejectReady(new Error('Bluetooth response reading stopped.'));
    void this.cancelRead().catch(() => undefined);
  }

  async #poll(): Promise<void> {
    if (!this.#active) return;
    const fail = () => {
      if (!this.#active) return;
      this.stop();
      this.onError(new Error('Bluetooth response reading failed. Reconnect to the PC.'));
    };
    this.#timer = setTimeout(fail, this.timeoutMs);
    try {
      const value = await this.read();
      if (!this.#active) return;
      clearTimeout(this.#timer);
      if (value === null || value.length > 240 || (value !== '' && (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) || toByteArray(value).length > 180))) {
        fail(); return;
      }
      this.#resolveReady();
      if (value) this.onFrame(value);
      if (this.#active) this.#timer = setTimeout(() => { void this.#poll(); }, value ? 0 : 100);
    } catch {
      fail();
    }
  }
}
