import * as Crypto from 'expo-crypto';

import { authenticatedCommand, commandPayloads, pairingRequest } from '@/domain/protocol/commands';
import type { JsonObject, PointerProfile } from '@/domain/protocol/types';
import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import type { PairingStorage, SavedPc } from '@/storage/PairingStore';
import type { BleAvailability, BleTransport, DiscoveredDesktop, Unsubscribe } from '@/transport/BleTransport';
import { ProtocolClient } from './ProtocolClient';
import { pairingVerificationCode } from './verificationCode';

export type ConnectionState =
  | { kind: 'idle'; saved: SavedPc[] }
  | { kind: 'permissionDenied'; saved: SavedPc[] }
  | { kind: 'bluetoothOff'; saved: SavedPc[] }
  | { kind: 'unsupported'; saved: SavedPc[] }
  | { kind: 'scanning'; saved: SavedPc[]; discovered: DiscoveredDesktop[] }
  | { kind: 'connecting'; desktop: DiscoveredDesktop }
  | { kind: 'reconnecting'; desktop: DiscoveredDesktop; attempt: number }
  | { kind: 'pairing'; desktop: DiscoveredDesktop; verificationCode: string }
  | { kind: 'connected'; desktop: DiscoveredDesktop; profile: PointerProfile | null }
  | { kind: 'failed'; message: string; saved: SavedPc[] };

type Cleanup = () => Promise<void> | void;

export class ConnectionManager {
  #state: ConnectionState = { kind: 'idle', saved: [] };
  #listeners = new Set<() => void>();
  #scanStop: Unsubscribe | null = null;
  #disconnectStop: Unsubscribe | null = null;
  #client: ProtocolClient | null = null;
  #token: string | null = null;
  #deviceId: string | null = null;
  #cleanups = new Set<Cleanup>();
  #operation = 0;

  constructor(
    private readonly transport: BleTransport,
    private readonly storage: PairingStorage,
    readonly diagnostics: DiagnosticLog,
    private readonly requestPermission: () => Promise<boolean>,
    private readonly now = Date.now,
    private readonly id = () => `remote-${Crypto.randomUUID()}`,
    private readonly reconnectDelay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#state;
  registerCleanup(cleanup: Cleanup): Unsubscribe { this.#cleanups.add(cleanup); return () => this.#cleanups.delete(cleanup); }

  async load(): Promise<void> {
    const operation = ++this.#operation;
    const saved = await this.#orderedSaved();
    if (this.#current(operation)) this.#set({ kind: 'idle', saved });
  }

  async scan(): Promise<void> {
    await this.disconnect(false);
    const operation = ++this.#operation;
    const saved = await this.#orderedSaved();
    if (!this.#current(operation)) return;
    if (!await this.requestPermission()) { if (this.#current(operation)) this.#set({ kind: 'permissionDenied', saved }); return; }
    if (!this.#current(operation)) return;
    const availability = await this.transport.availability();
    if (!this.#current(operation)) return;
    if (availability !== 'ready') { this.#set(this.#availabilityState(availability, saved)); return; }
    this.diagnostics.add('scan_started');
    const discovered = new Map<string, DiscoveredDesktop>();
    this.#set({ kind: 'scanning', saved, discovered: [] });
    this.#scanStop = this.transport.scan((desktop) => {
      if (!this.#current(operation)) return;
      discovered.set(desktop.desktopId, desktop);
      this.#set({ kind: 'scanning', saved, discovered: [...discovered.values()] });
    }, () => { void this.#handleScanFailure(operation, saved); });
  }

  async connect(desktop: DiscoveredDesktop): Promise<void> {
    const operation = ++this.#operation;
    this.#scanStop?.(); this.#scanStop = null;
    await this.#teardownConnection();
    if (!this.#current(operation)) return;
    this.#set({ kind: 'connecting', desktop });
    this.diagnostics.add('connecting');
    try {
      await this.transport.connect(desktop.peripheralId);
      if (!this.#current(operation)) return;
      this.#disconnectStop = this.transport.subscribeDisconnect(() => void this.#unexpectedDisconnect(desktop, operation));
      const client = new ProtocolClient(this.transport, this.id);
      client.start(() => void this.#unexpectedDisconnect(desktop, operation));
      this.#client = client;
      this.#deviceId = await this.storage.getDeviceId();
      if (!this.#current(operation)) return;
      const token = await this.storage.token(desktop.desktopId);
      if (!this.#current(operation)) return;
      if (token) await this.#authenticate(desktop, token, operation);
      else await this.#pair(desktop, operation);
    } catch {
      if (this.#current(operation)) await this.#fail('Could not connect to this PC.', operation);
    }
  }

  async connectSaved(pc: SavedPc): Promise<void> {
    await this.connect({ desktopId: pc.desktopId, displayName: pc.displayName, platform: pc.platform, peripheralId: pc.peripheralId, rssi: null });
  }

  async unpair(desktopId: string): Promise<boolean> {
    if ('desktop' in this.#state && this.#state.desktop.desktopId === desktopId) await this.disconnect();
    try {
      await this.storage.remove(desktopId);
      await this.load();
      return true;
    } catch {
      this.diagnostics.add('unpair_failed', 'warning');
      this.#set({ kind: 'failed', message: 'Could not remove this saved PC.', saved: await this.#orderedSaved() });
      return false;
    }
  }

  listSaved(): Promise<SavedPc[]> { return this.#orderedSaved(); }
  defaultDesktopId(): Promise<string | null> { return this.storage.defaultDesktopId(); }
  async setDefaultDesktopId(desktopId: string | null): Promise<void> {
    await this.storage.setDefaultDesktopId(desktopId);
    if ('saved' in this.#state) this.#set({ ...this.#state, saved: await this.#orderedSaved() });
  }

  async disconnect(record = true): Promise<void> {
    const operation = ++this.#operation;
    this.#scanStop?.(); this.#scanStop = null;
    // Cancel older acknowledgement waits, then send best-effort cleanup while
    // the authenticated client and transport remain available.
    await this.#client?.cancelOutstanding();
    for (const cleanup of [...this.#cleanups]) await Promise.resolve(cleanup()).catch(() => undefined);
    await this.#teardownConnection();
    if (!this.#current(operation)) return;
    if (record) { this.diagnostics.add('cleanup_complete'); this.diagnostics.add('disconnected'); }
    const saved = await this.#orderedSaved();
    if (this.#current(operation)) this.#set({ kind: 'idle', saved });
  }

  async send(type: string, payload: JsonObject = {}, responseMode: 'ack' | 'none' = 'ack'): Promise<boolean> {
    if (!this.#client || !this.#token || !this.#deviceId) return false;
    const id = this.id();
    const message = authenticatedCommand({ id, deviceId: this.#deviceId, token: this.#token, timestamp: this.now(), type, payload, responseMode });
    try {
      if (responseMode === 'none') { await this.#client.send(message); return true; }
      const response = await this.#client.request(message, id, 5_000);
      if (response.kind === 'ack') {
        if (type === 'pointer.speed.set' && typeof payload.scalePercent === 'number' && this.#state.kind === 'connected' && this.#state.profile) {
          this.#set({ ...this.#state, profile: { ...this.#state.profile, capabilities: { ...this.#state.profile.capabilities, pointerSpeed: { ...this.#state.profile.capabilities.pointerSpeed, scalePercent: payload.scalePercent } } } });
        }
        return true;
      }
      if (response.kind === 'error' && response.code === 'invalid_auth') await this.#fail('Saved access is no longer valid.', this.#operation, true);
    } catch { /* sanitized below */ }
    this.diagnostics.add('command_failed', 'warning');
    return false;
  }

  async #pair(desktop: DiscoveredDesktop, operation: number): Promise<void> {
    const requestId = this.id();
    const nonce = Crypto.randomUUID();
    this.#set({ kind: 'pairing', desktop, verificationCode: pairingVerificationCode(desktop.desktopId, this.#deviceId!, nonce) });
    this.diagnostics.add('pairing_requested');
    const response = await this.#client!.request(pairingRequest({ id: requestId, deviceId: this.#deviceId!, deviceName: 'Switchify Remote', desktopId: desktop.desktopId, requestNonce: nonce }), requestId, 60_000);
    if (!this.#current(operation)) return;
    if (response.kind !== 'pairingComplete' || response.desktopId !== desktop.desktopId || response.deviceId !== this.#deviceId) {
      if (response.kind === 'error') this.diagnostics.add('pairing_rejected', 'warning');
      throw new Error('Pairing was not completed.');
    }
    await this.storage.save({ desktopId: desktop.desktopId, displayName: desktop.displayName, platform: desktop.platform, peripheralId: desktop.peripheralId, lastConnectedAt: this.now() }, response.token);
    if (!this.#current(operation)) return;
    await this.#authenticate(desktop, response.token, operation);
  }

  async #authenticate(desktop: DiscoveredDesktop, token: string, operation: number): Promise<void> {
    const [pingType, pingPayload] = commandPayloads.ping();
    const pingId = this.id();
    const ping = authenticatedCommand({ id: pingId, deviceId: this.#deviceId!, token, timestamp: this.now(), type: pingType, payload: pingPayload });
    const response = await this.#client!.request(ping, pingId);
    if (!this.#current(operation)) return;
    if (response.kind !== 'ack') {
      if (response.kind === 'error' && response.code === 'invalid_auth') { this.diagnostics.add('authentication_failed', 'error'); await this.storage.remove(desktop.desktopId); }
      throw new Error('Authentication failed.');
    }
    this.#token = token;
    const [profileType, profilePayload] = commandPayloads.pointerProfile();
    const profileId = this.id();
    const profileResponse = await this.#client!.request(authenticatedCommand({ id: profileId, deviceId: this.#deviceId!, token, timestamp: this.now(), type: profileType, payload: profilePayload }), profileId, 5_000).catch(() => null);
    if (!this.#current(operation)) return;
    const profile = profileResponse?.kind === 'pointerProfile' ? profileResponse.profile : null;
    const saved = { desktopId: desktop.desktopId, displayName: desktop.displayName, platform: desktop.platform, peripheralId: desktop.peripheralId, lastConnectedAt: this.now() };
    await this.storage.save(saved, token);
    if (!this.#current(operation)) return;
    this.diagnostics.add('connected');
    this.#set({ kind: 'connected', desktop, profile });
  }

  async #unexpectedDisconnect(desktop: DiscoveredDesktop, sourceOperation: number): Promise<void> {
    if (!this.#current(sourceOperation) || this.#state.kind === 'idle' || this.#state.kind === 'reconnecting') return;
    const operation = ++this.#operation;
    await this.#teardownConnection();
    const token = await this.storage.token(desktop.desktopId);
    if (!token || !this.#current(operation)) { if (this.#current(operation)) await this.#fail('Connection to the PC was lost.', operation); return; }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (!this.#current(operation)) return;
      this.#set({ kind: 'reconnecting', desktop, attempt });
      await this.reconnectDelay(attempt * 500);
      if (!this.#current(operation)) return;
      try {
        await this.transport.connect(desktop.peripheralId);
        if (!this.#current(operation)) return;
        this.#disconnectStop = this.transport.subscribeDisconnect(() => void this.#unexpectedDisconnect(desktop, operation));
        const client = new ProtocolClient(this.transport, this.id);
        client.start(() => void this.#unexpectedDisconnect(desktop, operation));
        this.#client = client;
        this.#deviceId = await this.storage.getDeviceId();
        if (!this.#current(operation)) return;
        await this.#authenticate(desktop, token, operation);
        if (this.#current(operation) && this.#state.kind === 'connected') return;
      } catch {
        if (!this.#current(operation)) return;
        await this.#teardownConnection();
      }
    }
    if (this.#current(operation)) await this.#fail('Connection to the PC was lost.', operation);
  }

  async #fail(message: string, operation: number, auth = false): Promise<void> {
    if (!this.#current(operation)) return;
    const saved = await this.#orderedSaved();
    if (!this.#current(operation)) return;
    await this.#teardownConnection();
    if (!this.#current(operation)) return;
    if (auth) this.diagnostics.add('authentication_failed', 'error');
    this.#set({ kind: 'failed', message, saved });
  }

  async #teardownConnection(): Promise<void> {
    this.#disconnectStop?.(); this.#disconnectStop = null;
    const client = this.#client;
    this.#client = null; this.#token = null;
    if (client) await client.close();
    await this.transport.disconnect().catch(() => undefined);
  }

  async #orderedSaved(): Promise<SavedPc[]> {
    const saved = await this.storage.list();
    const defaultId = await this.storage.defaultDesktopId();
    return defaultId ? [...saved].sort((a, b) => Number(b.desktopId === defaultId) - Number(a.desktopId === defaultId)) : saved;
  }

  async #handleScanFailure(operation: number, saved: SavedPc[]): Promise<void> {
    if (!this.#current(operation)) return;
    const availability = await this.transport.availability().catch(() => 'poweredOff' as BleAvailability);
    if (!this.#current(operation)) return;
    this.diagnostics.add('scan_failed', 'error');
    this.#set(availability === 'ready' ? { kind: 'failed', message: 'Bluetooth discovery could not start.', saved } : this.#availabilityState(availability, saved));
  }

  #availabilityState(availability: Exclude<BleAvailability, 'ready'>, saved: SavedPc[]): ConnectionState {
    if (availability === 'unauthorized') return { kind: 'permissionDenied', saved };
    if (availability === 'unsupported') return { kind: 'unsupported', saved };
    return { kind: 'bluetoothOff', saved };
  }

  #current(operation: number): boolean { return operation === this.#operation; }

  #set(state: ConnectionState): void { this.#state = state; this.#listeners.forEach((listener) => listener()); }
}
