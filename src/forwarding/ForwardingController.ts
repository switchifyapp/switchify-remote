import type { SwitchifyBridge, BridgeEvent, ExternalSwitchInfo } from '@/bridge/types';
import type { JsonObject, PointerProfile, SwitchProfile } from '@/domain/protocol/types';
import * as Crypto from 'expo-crypto';

export type ForwardingMapping = ExternalSwitchInfo & { switchId: number; outputLabel: string | null; pressed: boolean; downTimeMs: number | null };
export type ForwardingState = {
  phase: 'idle' | 'starting' | 'active' | 'failed';
  profiles: SwitchProfile[];
  selectedProfileId: string | null;
  mappings: ForwardingMapping[];
  overflow: string[];
  message: string | null;
};

export interface ForwardingConnection {
  request(type: string, payload?: JsonObject, responseMode?: 'ack' | 'none'): Promise<import('@/domain/protocol/types').ProtocolResponse | null>;
  send(type: string, payload?: JsonObject, responseMode?: 'ack' | 'none'): Promise<boolean>;
}

type Timers = { interval(callback: () => void, ms: number): ReturnType<typeof setInterval>; timeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>; clear(handle: ReturnType<typeof setTimeout>): void };
const systemTimers: Timers = { interval: setInterval, timeout: setTimeout, clear: clearTimeout };

const genericCommands = ['switch.profile.list', 'switch.session.start', 'switch.edge', 'switch.sync', 'switch.session.stop'];

export class ForwardingController {
  #state: ForwardingState = { phase: 'idle', profiles: [], selectedProfileId: null, mappings: [], overflow: [], message: null };
  #listeners = new Set<() => void>();
  #unsubscribe: () => void;
  #generation = 0;
  #sessionId = '';
  #sequence = 0;
  #bridgeSequence = 0;
  #legacy = false;
  #attempt = 0;
  #disposed = false;
  #stopping: Promise<void> | null = null;
  #starting: Promise<boolean> | null = null;
  #pending = 0;
  #expectedSwitches: { keyCode: number; name: string }[] = [];
  #sync: ReturnType<typeof setInterval> | null = null;
  #idle: ReturnType<typeof setTimeout> | null = null;
  #queue = Promise.resolve();

  constructor(
    private readonly connection: ForwardingConnection,
    private readonly bridge: SwitchifyBridge,
    private readonly pointerProfile: PointerProfile,
    private readonly holdToStopMs = 5_000,
    private readonly timers: Timers = systemTimers,
    private readonly id = () => Crypto.randomUUID(),
    private readonly onSafetyStop: () => void = () => undefined,
  ) { this.#unsubscribe = bridge.subscribe((event) => this.#accept(event)); }

  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#state;

  async loadProfiles(remembered?: string): Promise<void> {
    const supported = this.pointerProfile.capabilities.supportedCommands;
    if (genericCommands.every((command) => supported.includes(command))) {
      const response = await this.connection.request('switch.profile.list', this.pointerProfile.capabilities.switchScanning ? { includeScanning: true } : {});
      if (response?.kind === 'switchProfileCatalog') {
        const selected = response.catalog.profiles.find((profile) => profile.id === remembered) ?? response.catalog.profiles[0] ?? null;
        this.#set({ profiles: response.catalog.profiles, selectedProfileId: selected?.id ?? null, message: selected ? null : 'This PC has no forwarding profiles.' });
        return;
      }
    }
    if (supported.includes('grid.switch.set')) {
      const legacy: SwitchProfile = { id: 'legacy.grid3', version: 1, name: 'Grid 3', kind: 'grid3', bindings: Array.from({ length: 8 }, (_, index) => ({ switchId: index + 1, label: `Switch ${index + 1}`, behavior: 'stateful' })) };
      this.#legacy = true;
      this.#set({ profiles: [legacy], selectedProfileId: legacy.id, message: null });
      return;
    }
    this.#set({ phase: 'failed', message: 'This PC does not support Switch Forwarding.' });
  }

  selectProfile(profileId: string): void { if (this.#state.profiles.some((profile) => profile.id === profileId)) this.#set({ selectedProfileId: profileId }); }
  selectedProfile(): SwitchProfile | null { return this.#state.profiles.find((profile) => profile.id === this.#state.selectedProfileId) ?? null; }
  report(message: string): void { this.#set({ message }); }

  async start(): Promise<boolean> {
    if (this.#stopping) await this.#stopping;
    if (this.#starting) {
      if (this.#state.phase === 'starting' || this.#state.phase === 'active') return false;
      await this.#starting;
    }
    if (this.#state.phase === 'starting' || this.#state.phase === 'active') return false;
    const starting = this.#start();
    this.#starting = starting;
    try { return await starting; } finally { if (this.#starting === starting) this.#starting = null; }
  }

  async #start(): Promise<boolean> {
    if (this.#state.phase === 'starting' || this.#state.phase === 'active') return false;
    if (this.#disposed) return false;
    const attempt = ++this.#attempt;
    const snapshot = this.bridge.snapshot();
    const selected = this.#state.profiles.find((profile) => profile.id === this.#state.selectedProfileId);
    if (!snapshot.captureAvailable || snapshot.externalSwitches.length === 0) { this.#set({ phase: 'failed', message: 'Turn on Switchify Accessibility and configure an external switch first.' }); return false; }
    if (!selected) return false;
    this.#set({ phase: 'starting', message: null });
    this.#generation = this.bridge.nextGeneration();
    this.#sessionId = this.id(); this.#sequence = 0; this.#bridgeSequence = 0;
    const external = [...snapshot.externalSwitches].sort((a, b) => a.keyCode - b.keyCode);
    this.#expectedSwitches = external.slice(0, 8).map(({ keyCode, name }) => ({ keyCode, name }));
    const mappings = external.slice(0, 8).map((item, index) => ({ ...item, switchId: index + 1, outputLabel: selected.bindings.find((binding) => binding.switchId === index + 1 && binding.behavior !== 'unassigned')?.label ?? null, pressed: false, downTimeMs: null }));
    if (!this.#legacy) {
      const ok = await this.connection.send('switch.session.start', { sessionId: this.#sessionId, profileId: selected.id, profileVersion: selected.version, switchCount: mappings.length });
      if (!ok) { this.#set({ phase: 'failed', message: 'Could not start Switch Forwarding.' }); return false; }
      if (attempt !== this.#attempt || this.#disposed) { await this.#stopPc(); return false; }
    }
    if (!await this.bridge.setForwardingActive(this.#generation, true)) { await this.#stopPc(); if (attempt === this.#attempt && !this.#disposed) this.#set({ phase: 'failed', message: 'Switchify is not available for forwarding.' }); return false; }
    if (attempt !== this.#attempt || this.#disposed) { await this.bridge.setForwardingActive(this.#generation, false); await this.#stopPc(); return false; }
    this.#set({ phase: 'active', mappings, overflow: external.slice(8).map((item) => item.name), message: null });
    await this.#syncNow(this.#heldIds(), attempt);
    if (attempt !== this.#attempt || this.#disposed) return false;
    this.#sync = this.timers.interval(() => { if (this.#pending >= 64) { void this.stop('Remote input queue is full. Start forwarding again.', true); return; } const held = this.#heldIds(); void this.#enqueue(() => this.#syncNow(held, attempt)); }, 1_000);
    this.#resetIdle();
    return true;
  }

  async stop(message: string | null = null, safety = false): Promise<void> {
    if (this.#stopping) return this.#stopping;
    this.#attempt += 1;
    if (this.#state.phase !== 'active' && this.#state.phase !== 'starting') return;
    if (safety) this.onSafetyStop();
    const generation = this.#generation;
    this.#clearTimers();
    this.#set({ phase: 'idle', mappings: this.#state.mappings.map((mapping) => ({ ...mapping, pressed: false, downTimeMs: null })), message });
    const stopping = (async () => {
      await this.bridge.setForwardingActive(generation, false);
      await this.#enqueue(() => this.#stopPc());
    })();
    this.#stopping = stopping;
    try { await stopping; } finally { if (this.#stopping === stopping) this.#stopping = null; }
  }

  async cleanup(): Promise<void> { this.#disposed = true; await this.stop(); this.#unsubscribe(); }

  #accept(event: BridgeEvent): void {
    if (event.type === 'snapshot' && (this.#state.phase === 'starting' || this.#state.phase === 'active')) {
      const configured = [...event.externalSwitches].sort((a, b) => a.keyCode - b.keyCode).slice(0, 8);
      const mapped = this.#state.phase === 'starting' ? this.#expectedSwitches : this.#state.mappings;
      if (!event.captureAvailable || configured.length === 0 || configured.some((item, index) => mapped[index]?.keyCode !== item.keyCode || mapped[index]?.name !== item.name) || configured.length !== mapped.length) {
        void this.stop('Switchify switch configuration changed. Forwarding stopped safely.', true);
        return;
      }
    }
    if (event.type !== 'switchEdge' || event.generation !== this.#generation || this.#state.phase !== 'active') return;
    if (this.#pending >= 64) { void this.stop('Remote input queue is full. Start forwarding again.', true); return; }
    if (event.sequence !== this.#bridgeSequence + 1) { void this.stop('A switch event was missed. Forwarding stopped safely.', true); return; }
    this.#bridgeSequence = event.sequence;
    const mapping = this.#state.mappings.find((item) => item.keyCode === event.keyCode);
    if (!mapping) return;
    this.#resetIdle();
    const duration = Math.max(0, event.eventTimeMs - event.downTimeMs);
    // Scanning profiles leave hold limits to the PC, which owns the hold-action
    // timing and its own emergency hold. A cancelled press is withdrawn with a
    // sync so the PC drops the gesture without selecting, and the session
    // continues; nothing here ends a scanning session on the user's behalf.
    const scanning = this.selectedProfile()?.kind === 'scanning';
    if (scanning && event.cancelled) {
      this.#set({ mappings: this.#state.mappings.map((item) => item.keyCode === event.keyCode ? { ...item, pressed: false, downTimeMs: null } : item) });
      const attempt = this.#attempt; const held = this.#heldIds();
      void this.#enqueue(() => this.#syncNow(held, attempt));
      return;
    }
    const replacement = event.down && mapping.pressed && mapping.downTimeMs !== event.downTimeMs;
    this.#set({ mappings: this.#state.mappings.map((item) => item.keyCode === event.keyCode ? { ...item, pressed: event.down, downTimeMs: event.down ? event.downTimeMs : null } : item) });
    const attempt = this.#attempt;
    void this.#enqueue(async () => {
      if (attempt !== this.#attempt || this.#state.phase !== 'active') return;
      if (replacement) await this.#edge(mapping.switchId, false);
      if (attempt !== this.#attempt || this.#state.phase !== 'active') return;
      await this.#edge(mapping.switchId, event.down);
      if (!scanning && !event.down && !event.cancelled && duration >= this.holdToStopMs) void this.stop('Forwarding stopped after the switch was held.', true);
    });
  }

  #edge(switchId: number, down: boolean): Promise<boolean> {
    this.#sequence += 1;
    return this.connection.send(this.#legacy ? 'grid.switch.set' : 'switch.edge', { switchId, state: down ? 'down' : 'up', ...(!this.#legacy || this.pointerProfile.capabilities.supportedCommands.includes('grid.switch.sync') ? { sessionId: this.#sessionId, sequence: this.#sequence } : {}) }, this.selectedProfile()?.kind !== 'scanning' && this.pointerProfile.capabilities.noAckCommands.includes(this.#legacy ? 'grid.switch.set' : 'switch.edge') ? 'none' : 'ack').then((ok) => { if (!ok && this.selectedProfile()?.kind === 'scanning') void this.stop('PC scanning stopped. Start forwarding again.', true); return ok; });
  }

  #heldIds(): number[] { return this.#state.mappings.filter((item) => item.pressed).map((item) => item.switchId); }

  async #syncNow(held: number[], attempt: number): Promise<void> {
    if (attempt !== this.#attempt) return;
    if (this.#state.phase !== 'active') return;
    if (this.#legacy && !this.pointerProfile.capabilities.supportedCommands.includes('grid.switch.sync')) return;
    this.#sequence += 1;
    const ok = await this.connection.send(this.#legacy ? 'grid.switch.sync' : 'switch.sync', { sessionId: this.#sessionId, sequence: this.#sequence, pressedSwitchIds: held });
    if (attempt === this.#attempt && !ok && this.selectedProfile()?.kind === 'scanning') void this.stop('PC scanning stopped. Start forwarding again.', true);
  }

  async #stopPc(): Promise<void> {
    this.#sequence += 1;
    if (this.#legacy) {
      if (this.pointerProfile.capabilities.supportedCommands.includes('grid.switch.sync')) await this.connection.send('grid.switch.sync', { sessionId: this.#sessionId, sequence: this.#sequence, pressedSwitchIds: [] });
      else for (const mapping of this.#state.mappings) await this.connection.send('grid.switch.set', { switchId: mapping.switchId, state: 'up' });
    } else await this.connection.send('switch.session.stop', { sessionId: this.#sessionId, sequence: this.#sequence });
  }

  // A scanning user may watch the PC screen for a long time between presses,
  // so the idle stop applies to keyboard forwarding only.
  #resetIdle(): void { if (this.#idle) this.timers.clear(this.#idle); this.#idle = null; if (this.selectedProfile()?.kind === 'scanning') return; this.#idle = this.timers.timeout(() => { void this.stop('Forwarding stopped after 60 seconds without switch activity.', true); }, 60_000); }
  #clearTimers(): void { if (this.#sync) this.timers.clear(this.#sync); if (this.#idle) this.timers.clear(this.#idle); this.#sync = null; this.#idle = null; }
  #enqueue<T>(operation: () => Promise<T>): Promise<T> { this.#pending++; const next = this.#queue.then(operation, operation).finally(() => { this.#pending--; }); this.#queue = next.then(() => undefined, () => undefined); return next; }
  #set(patch: Partial<ForwardingState>): void { this.#state = { ...this.#state, ...patch }; this.#listeners.forEach((listener) => listener()); }
}
