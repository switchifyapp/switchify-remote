import * as Crypto from 'expo-crypto';

import { authenticatedCommand, commandPayloads, pairingRequest } from '@/domain/protocol/commands';
import type { PointerProfile } from '@/domain/protocol/types';
import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import type { PairingStorage, SavedPc } from '@/storage/PairingStore';
import type { BleTransport, DiscoveredDesktop, Unsubscribe } from '@/transport/BleTransport';
import { ProtocolClient } from './ProtocolClient';
import { pairingVerificationCode } from './verificationCode';

export type ConnectionState =
  | { kind: 'idle'; saved: SavedPc[] }
  | { kind: 'permissionDenied'; saved: SavedPc[] }
  | { kind: 'scanning'; saved: SavedPc[]; discovered: DiscoveredDesktop[] }
  | { kind: 'connecting'; desktop: DiscoveredDesktop }
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

  constructor(
    private readonly transport: BleTransport,
    private readonly storage: PairingStorage,
    readonly diagnostics: DiagnosticLog,
    private readonly requestPermission: () => Promise<boolean>,
    private readonly now = Date.now,
    private readonly id = () => `remote-${Crypto.randomUUID()}`,
  ) {}

  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#state;
  registerCleanup(cleanup: Cleanup): Unsubscribe { this.#cleanups.add(cleanup); return () => this.#cleanups.delete(cleanup); }

  async load(): Promise<void> { this.#set({ kind: 'idle', saved: await this.storage.list() }); }

  async scan(): Promise<void> {
    await this.disconnect(false);
    const saved = await this.storage.list();
    if (!await this.requestPermission()) { this.#set({ kind: 'permissionDenied', saved }); return; }
    this.diagnostics.add('scan_started');
    const discovered = new Map<string, DiscoveredDesktop>();
    this.#set({ kind: 'scanning', saved, discovered: [] });
    this.#scanStop = this.transport.scan((desktop) => {
      discovered.set(desktop.desktopId, desktop);
      this.#set({ kind: 'scanning', saved, discovered: [...discovered.values()] });
    }, () => { this.diagnostics.add('scan_failed', 'error'); this.#set({ kind: 'failed', message: 'Bluetooth discovery could not start.', saved }); });
  }

  async connect(desktop: DiscoveredDesktop): Promise<void> {
    this.#scanStop?.(); this.#scanStop = null;
    this.#set({ kind: 'connecting', desktop });
    this.diagnostics.add('connecting');
    try {
      await this.transport.connect(desktop.peripheralId);
      this.#disconnectStop = this.transport.subscribeDisconnect(() => void this.#unexpectedDisconnect());
      const client = new ProtocolClient(this.transport);
      client.start(() => void this.#unexpectedDisconnect());
      this.#client = client;
      this.#deviceId = await this.storage.getDeviceId();
      const token = await this.storage.token(desktop.desktopId);
      if (token) await this.#authenticate(desktop, token);
      else await this.#pair(desktop);
    } catch {
      await this.#fail('Could not connect to this PC.');
    }
  }

  async connectSaved(pc: SavedPc): Promise<void> {
    await this.connect({ desktopId: pc.desktopId, displayName: pc.displayName, platform: pc.platform, peripheralId: pc.peripheralId, rssi: null });
  }

  async unpair(desktopId: string): Promise<void> {
    if (this.#state.kind === 'connected' && this.#state.desktop.desktopId === desktopId) await this.disconnect();
    await this.storage.remove(desktopId);
    await this.load();
  }

  async disconnect(record = true): Promise<void> {
    this.#scanStop?.(); this.#scanStop = null;
    for (const cleanup of [...this.#cleanups]) await Promise.resolve(cleanup()).catch(() => undefined);
    this.#disconnectStop?.(); this.#disconnectStop = null;
    this.#client?.close(); this.#client = null; this.#token = null;
    await this.transport.disconnect().catch(() => undefined);
    if (record) { this.diagnostics.add('cleanup_complete'); this.diagnostics.add('disconnected'); }
    this.#set({ kind: 'idle', saved: await this.storage.list() });
  }

  async send(type: string, payload: Record<string, string | number | boolean | string[]> = {}, responseMode: 'ack' | 'none' = 'ack'): Promise<boolean> {
    if (!this.#client || !this.#token || !this.#deviceId) return false;
    const id = this.id();
    const message = authenticatedCommand({ id, deviceId: this.#deviceId, token: this.#token, timestamp: this.now(), type, payload, responseMode });
    try {
      if (responseMode === 'none') { await this.#client.send(message); return true; }
      const response = await this.#client.request(message, id, 5_000);
      if (response.kind === 'ack') return true;
      if (response.kind === 'error' && response.code === 'invalid_auth') await this.#fail('Saved access is no longer valid.', true);
    } catch { /* sanitized below */ }
    this.diagnostics.add('command_failed', 'warning');
    return false;
  }

  async #pair(desktop: DiscoveredDesktop): Promise<void> {
    const requestId = this.id();
    const nonce = Crypto.randomUUID();
    this.#set({ kind: 'pairing', desktop, verificationCode: pairingVerificationCode(desktop.desktopId, this.#deviceId!, nonce) });
    this.diagnostics.add('pairing_requested');
    const response = await this.#client!.request(pairingRequest({ id: requestId, deviceId: this.#deviceId!, deviceName: 'Switchify Remote', desktopId: desktop.desktopId, requestNonce: nonce }), requestId, 60_000);
    if (response.kind !== 'pairingComplete' || response.desktopId !== desktop.desktopId || response.deviceId !== this.#deviceId) {
      if (response.kind === 'error') this.diagnostics.add('pairing_rejected', 'warning');
      throw new Error('Pairing was not completed.');
    }
    await this.storage.save({ desktopId: desktop.desktopId, displayName: desktop.displayName, platform: desktop.platform, peripheralId: desktop.peripheralId, lastConnectedAt: this.now() }, response.token);
    await this.#authenticate(desktop, response.token);
  }

  async #authenticate(desktop: DiscoveredDesktop, token: string): Promise<void> {
    const [pingType, pingPayload] = commandPayloads.ping();
    const pingId = this.id();
    const ping = authenticatedCommand({ id: pingId, deviceId: this.#deviceId!, token, timestamp: this.now(), type: pingType, payload: pingPayload });
    const response = await this.#client!.request(ping, pingId);
    if (response.kind !== 'ack') {
      if (response.kind === 'error' && response.code === 'invalid_auth') { this.diagnostics.add('authentication_failed', 'error'); await this.storage.remove(desktop.desktopId); }
      throw new Error('Authentication failed.');
    }
    this.#token = token;
    const [profileType, profilePayload] = commandPayloads.pointerProfile();
    const profileId = this.id();
    const profileResponse = await this.#client!.request(authenticatedCommand({ id: profileId, deviceId: this.#deviceId!, token, timestamp: this.now(), type: profileType, payload: profilePayload }), profileId, 5_000).catch(() => null);
    const profile = profileResponse?.kind === 'pointerProfile' ? profileResponse.profile : null;
    const saved = { desktopId: desktop.desktopId, displayName: desktop.displayName, platform: desktop.platform, peripheralId: desktop.peripheralId, lastConnectedAt: this.now() };
    await this.storage.save(saved, token);
    this.diagnostics.add('connected');
    this.#set({ kind: 'connected', desktop, profile });
  }

  async #unexpectedDisconnect(): Promise<void> {
    if (this.#state.kind === 'idle') return;
    await this.#fail('Connection to the PC was lost.');
  }

  async #fail(message: string, auth = false): Promise<void> {
    const saved = await this.storage.list();
    this.#client?.close(); this.#client = null; this.#token = null;
    this.#disconnectStop?.(); this.#disconnectStop = null;
    await this.transport.disconnect().catch(() => undefined);
    if (auth) this.diagnostics.add('authentication_failed', 'error');
    this.#set({ kind: 'failed', message, saved });
  }

  #set(state: ConnectionState): void { this.#state = state; this.#listeners.forEach((listener) => listener()); }
}
