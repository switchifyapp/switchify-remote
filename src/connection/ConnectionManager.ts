import * as Crypto from 'expo-crypto';

import { authenticatedCommand, commandPayloads, pairingRequest } from '@/domain/protocol/commands';
import type { JsonObject, PointerProfile, ProtocolResponse } from '@/domain/protocol/types';
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
  #preferredConnect: Promise<void> | null = null;
  #disconnecting: Promise<void> | null = null;
  #invalidSavedDesktopIds = new Set<string>();

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
    const operation = this.#operation;
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
      const resolved = await this.transport.resolveAndConnect(desktop.desktopId);
      if (!this.#current(operation)) return;
      await this.#connectDesktop(resolved, operation, true, true);
    } catch {
      if (this.#current(operation)) await this.#fail('Could not connect to this PC.', operation);
    }
  }

  async connectSaved(pc: SavedPc): Promise<void> {
    const operation = ++this.#operation;
    this.#scanStop?.(); this.#scanStop = null;
    await this.#teardownConnection();
    if (!this.#current(operation)) return;

    let token: string | null;
    try { token = await this.storage.token(pc.desktopId); }
    catch {
      if (this.#current(operation)) await this.#fail('Could not load saved access. Try again.', operation);
      return;
    }
    if (!this.#current(operation)) return;
    if (!token) {
      this.#invalidSavedDesktopIds.add(pc.desktopId);
      await this.storage.remove(pc.desktopId).catch(() => undefined);
      if (this.#current(operation)) await this.#fail('Saved access is no longer available. Request access again.', operation, true);
      return;
    }

    const saved = await this.#orderedSaved();
    if (!this.#current(operation)) return;
    if (!await this.requestPermission()) {
      if (this.#current(operation)) this.#set({ kind: 'permissionDenied', saved });
      return;
    }
    if (!this.#current(operation)) return;
    const availability = await this.transport.availability();
    if (!this.#current(operation)) return;
    if (availability !== 'ready') {
      this.#set(this.#availabilityState(availability, saved));
      return;
    }

    const savedDesktop: DiscoveredDesktop = { ...pc, rssi: null };
    this.#set({ kind: 'connecting', desktop: savedDesktop });
    this.diagnostics.add('connecting');
    try {
      const resolved = await this.transport.resolveAndConnect(pc.desktopId);
      if (!this.#current(operation)) return;
      await this.#connectDesktop(resolved, operation, true, true, token);
    } catch {
      if (this.#current(operation)) await this.#fail('Could not find this PC nearby.', operation);
    }
  }

  async connectPreferred(): Promise<void> {
    if (this.#preferredConnect) return this.#preferredConnect;
    const attempt = (async () => {
      await this.#disconnecting;
      if (this.#state.kind === 'connected' || this.#state.kind === 'connecting' || this.#state.kind === 'pairing' || this.#state.kind === 'reconnecting' || this.#state.kind === 'scanning') return;
      const sourceOperation = this.#operation;
      const saved = await this.#orderedSaved();
      if (sourceOperation !== this.#operation) return;
      if (saved.length === 0) {
        this.#set({ kind: 'idle', saved: [] });
        return;
      }
      await this.connectSaved(saved[0]!);
    })();
    this.#preferredConnect = attempt;
    try { await attempt; }
    finally { if (this.#preferredConnect === attempt) this.#preferredConnect = null; }
  }

  async cancelPreferredConnection(): Promise<void> {
    if (!this.#preferredConnect || this.#state.kind === 'connected') return;
    await this.disconnect(false);
  }

  async #connectDesktop(desktop: DiscoveredDesktop, operation: number, announced = false, transportConnected = false, savedToken: string | null = null): Promise<void> {
    this.#set({ kind: 'connecting', desktop });
    if (!announced) this.diagnostics.add('connecting');
    try {
      if (!transportConnected) await this.transport.connect(desktop.peripheralId);
      if (!this.#current(operation)) return;
      this.#disconnectStop = this.transport.subscribeDisconnect(() => void this.#unexpectedDisconnect(desktop, operation));
      const client = new ProtocolClient(this.transport, this.id);
      await client.start(() => void this.#unexpectedDisconnect(desktop, operation));
      if (!this.#current(operation)) { await client.close(); return; }
      this.#client = client;
      this.#deviceId = await this.storage.getDeviceId();
      if (!this.#current(operation)) return;
      const token = this.#invalidSavedDesktopIds.has(desktop.desktopId) ? null : savedToken ?? await this.storage.token(desktop.desktopId);
      if (!this.#current(operation)) return;
      if (token) await this.#authenticate(desktop, token, operation);
      else await this.#pair(desktop, operation);
    } catch (error) {
      if (!this.#current(operation)) return;
      if (error instanceof InvalidSavedAccessError) await this.#fail('Saved access is no longer valid. Request access again.', operation, true);
      else await this.#fail('Could not connect to this PC.', operation);
    }
  }

  async unpair(desktopId: string): Promise<boolean> {
    if ('desktop' in this.#state && this.#state.desktop.desktopId === desktopId) await this.disconnect();
    try {
      await this.storage.remove(desktopId);
      this.#invalidSavedDesktopIds.delete(desktopId);
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
    if (this.#disconnecting) return this.#disconnecting;
    this.#preferredConnect = null;
    const attempt = this.#disconnect(record);
    this.#disconnecting = attempt;
    try { await attempt; }
    finally { if (this.#disconnecting === attempt) this.#disconnecting = null; }
  }

  async #disconnect(record: boolean): Promise<void> {
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
    const response = await this.request(type, payload, responseMode);
    return responseMode === 'none' ? response !== null : response?.kind === 'ack';
  }

  async request(type: string, payload: JsonObject = {}, responseMode: 'ack' | 'none' = 'ack'): Promise<ProtocolResponse | null> {
    if (!this.#client || !this.#token || !this.#deviceId) return null;
    const id = this.id();
    const message = authenticatedCommand({ id, deviceId: this.#deviceId, token: this.#token, timestamp: this.now(), type, payload, responseMode });
    try {
      if (responseMode === 'none') { await this.#client.send(message); return { kind: 'ack', id }; }
      const response = await this.#client.request(message, id, 5_000);
      if (response.kind === 'ack') {
        if (type === 'pointer.speed.set' && typeof payload.scalePercent === 'number' && this.#state.kind === 'connected' && this.#state.profile) {
          this.#set({ ...this.#state, profile: { ...this.#state.profile, capabilities: { ...this.#state.profile.capabilities, pointerSpeed: { ...this.#state.profile.capabilities.pointerSpeed, scalePercent: payload.scalePercent } } } });
        }
        return response;
      }
      if (response.kind === 'switchProfileCatalog') return response;
      if (response.kind === 'error' && response.code === 'invalid_auth') await this.#fail('Saved access is no longer valid.', this.#operation, true);
    } catch { /* sanitized below */ }
    this.diagnostics.add('command_failed', 'warning');
    return null;
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
      if (response.kind === 'error' && response.code === 'invalid_auth') {
        this.#invalidSavedDesktopIds.add(desktop.desktopId);
        await this.storage.remove(desktop.desktopId).catch(() => undefined);
        throw new InvalidSavedAccessError();
      }
      throw new Error('Authentication failed.');
    }
    this.#token = token;
    const profile = await this.#requestPointerProfile(token, operation);
    if (!this.#current(operation)) return;
    const saved = { desktopId: desktop.desktopId, displayName: desktop.displayName, platform: desktop.platform, peripheralId: desktop.peripheralId, lastConnectedAt: this.now() };
    await this.storage.save(saved, token);
    this.#invalidSavedDesktopIds.delete(desktop.desktopId);
    if (!this.#current(operation)) return;
    this.diagnostics.add('connected');
    this.#set({ kind: 'connected', desktop, profile });
  }

  async #requestPointerProfile(token: string, operation: number): Promise<PointerProfile | null> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!this.#current(operation)) return null;
      const [type, payload] = commandPayloads.pointerProfile();
      const id = this.id();
      const response = await this.#client!.request(authenticatedCommand({ id, deviceId: this.#deviceId!, token, timestamp: this.now(), type, payload }), id, 5_000).catch(() => null);
      if (!this.#current(operation)) return null;
      if (response?.kind === 'pointerProfile') return response.profile;
    }
    return null;
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
        const resolved = await this.transport.resolveAndConnect(desktop.desktopId);
        if (!this.#current(operation)) return;
        this.#disconnectStop = this.transport.subscribeDisconnect(() => void this.#unexpectedDisconnect(resolved, operation));
        const client = new ProtocolClient(this.transport, this.id);
        await client.start(() => void this.#unexpectedDisconnect(resolved, operation));
        if (!this.#current(operation)) { await client.close(); return; }
        this.#client = client;
        this.#deviceId = await this.storage.getDeviceId();
        if (!this.#current(operation)) return;
        await this.#authenticate(resolved, token, operation);
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
    const saved = (await this.storage.list()).filter((pc) => !this.#invalidSavedDesktopIds.has(pc.desktopId));
    const defaultId = await this.storage.defaultDesktopId().catch(() => null);
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

class InvalidSavedAccessError extends Error {}
