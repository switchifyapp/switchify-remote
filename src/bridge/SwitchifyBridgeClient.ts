import type { NativeSwitchifyAndroidBridge } from './NativeSwitchifyAndroidBridge';
import { loadNativeSwitchifyAndroidBridge } from './NativeSwitchifyAndroidBridge';
import type { BridgeEvent, BridgeSnapshot, SwitchifyBridge } from './types';

const unavailable: BridgeSnapshot = { version: 0, captureAvailable: false, externalSwitches: [] };
const supportedVersion = 1;

export class SwitchifyBridgeClient implements SwitchifyBridge {
  #snapshot = unavailable;
  #listeners = new Set<(event: BridgeEvent) => void>();
  #nativeSubscription: { remove(): void } | null = null;
  #generation = Date.now();

  constructor(private readonly native: NativeSwitchifyAndroidBridge | null = loadNativeSwitchifyAndroidBridge()) {}

  snapshot = () => this.#snapshot;

  subscribe(listener: (event: BridgeEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async connect(): Promise<boolean> {
    if (!this.native) return false;
    this.#nativeSubscription ??= this.native.addListener('onBridgeEvent', (event) => this.#accept(event));
    const started = await this.native.connectAsync().catch(() => false);
    if (started) {
      const snapshot = await this.native.snapshotAsync().catch(() => unavailable);
      this.#accept({
        type: 'snapshot',
        version: snapshot.version,
        captureAvailable: snapshot.captureAvailable,
        externalSwitches: snapshot.externalSwitches,
      });
    } else this.#accept({ type: 'snapshot', ...unavailable });
    return started;
  }

  async disconnect(): Promise<void> {
    await this.native?.disconnectAsync().catch(() => undefined);
    this.#nativeSubscription?.remove();
    this.#nativeSubscription = null;
    this.#accept({ type: 'snapshot', ...unavailable });
  }

  nextGeneration(): number {
    this.#generation += 1;
    return this.#generation;
  }

  setRepeatActive(generation: number, active: boolean): Promise<boolean> {
    return this.native?.setRepeatActiveAsync(generation, active).catch(() => false) ?? Promise.resolve(false);
  }

  setForwardingActive(generation: number, active: boolean): Promise<boolean> {
    return this.native?.setForwardingActiveAsync(generation, active).catch(() => false) ?? Promise.resolve(false);
  }

  #accept(event: BridgeEvent): void {
    let accepted = event;
    if (event.type === 'snapshot') {
      const version = Number.isInteger(event.version) ? event.version : 0;
      this.#snapshot = version === supportedVersion ? {
        version,
        captureAvailable: event.captureAvailable === true,
        externalSwitches: Array.isArray(event.externalSwitches) ? event.externalSwitches.filter((item) => Number.isInteger(item.keyCode) && typeof item.name === 'string') : [],
      } : unavailable;
      accepted = { type: 'snapshot', ...this.#snapshot };
    }
    this.#listeners.forEach((listener) => listener(accepted));
  }
}

export const switchifyBridge = new SwitchifyBridgeClient();
