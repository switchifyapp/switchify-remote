import { fromByteArray, toByteArray } from 'base64-js';

import { BLE_UUIDS } from '@/domain/protocol/constants';
import { parseStatus } from '@/domain/protocol/responses';
import type { PcStatus } from '@/domain/protocol/types';
import type { ConnectionStage, ConnectionStageOutcome, DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import { BluetoothDeviceSelectionCancelledError, type BleAvailability, type BleTransport, type DiscoveredDesktop, type Unsubscribe } from './BleTransport';
import { desktopDisplayName } from './desktopDisplayName';
import { ReadResponsePoller } from './ReadResponsePoller';

/**
 * Web Bluetooth does not report the negotiated MTU and macOS Switchify PC rejects
 * long (offset) writes, so frames stay within a 185-byte ATT MTU.
 */
export const WEB_MAX_WRITE_VALUE_BYTES = 182;

export interface WebBluetoothCharacteristic extends EventTarget {
  readonly value?: DataView | null;
  readValue(): Promise<DataView>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<WebBluetoothCharacteristic>;
  stopNotifications(): Promise<WebBluetoothCharacteristic>;
}

export interface WebBluetoothService {
  getCharacteristic(uuid: string): Promise<WebBluetoothCharacteristic>;
}

export interface WebBluetoothServer {
  readonly connected: boolean;
  connect(): Promise<WebBluetoothServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<WebBluetoothService>;
}

export interface WebBluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string | null;
  readonly gatt?: WebBluetoothServer | null;
}

export interface WebBluetooth {
  getAvailability?(): Promise<boolean>;
  getDevices?(): Promise<WebBluetoothDevice[]>;
  requestDevice(options: { filters: { services: string[] }[]; optionalServices?: string[] }): Promise<WebBluetoothDevice>;
}

type Characteristics = {
  receive: WebBluetoothCharacteristic;
  transmit: WebBluetoothCharacteristic;
  status: WebBluetoothCharacteristic;
  response: WebBluetoothCharacteristic | null;
};

type Session = { device: WebBluetoothDevice; server: WebBluetoothServer; characteristics: Characteristics; readReplies: boolean };

type Pending = { start: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: Error) => void; write: boolean };

export function navigatorBluetooth(): WebBluetooth | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { bluetooth?: WebBluetooth }).bluetooth ?? null;
}

function decodeStatus(view: DataView): PcStatus | null {
  return parseStatus(new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)));
}

function toBase64(view: DataView): string {
  return fromByteArray(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
}

function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotFoundError';
}

export class WebBluetoothTransport implements BleTransport {
  #operation = 0;
  #session: Session | null = null;
  #devices = new Map<string, WebBluetoothDevice>();
  #desktopDevices = new Map<string, string>();
  #probes = new Set<WebBluetoothDevice>();
  #queue: Pending[] = [];
  #running: Pending | null = null;
  #writePoisoned = false;
  #responsePoller: ReadResponsePoller | null = null;
  #notificationsReady: Promise<void> | null = null;
  #timers = new Set<(error: Error) => void>();

  constructor(
    private readonly bluetooth: () => WebBluetooth | null = navigatorBluetooth,
    private readonly timeoutMs = 10_000,
    private readonly diagnostics?: Pick<DiagnosticLog, 'addConnectionStage'>,
  ) {}

  async availability(): Promise<BleAvailability> {
    const bluetooth = this.bluetooth();
    if (!bluetooth) return 'unsupported';
    if (!bluetooth.getAvailability) return 'ready';
    try {
      return await bluetooth.getAvailability() ? 'ready' : 'poweredOff';
    } catch {
      return 'unsupported';
    }
  }

  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe {
    const operation = ++this.#operation;
    let active = true;
    let probe: WebBluetoothDevice | null = null;
    void (async () => {
      const bluetooth = this.bluetooth();
      if (!bluetooth) throw new Error('Web Bluetooth is unavailable.');
      const device = await bluetooth.requestDevice({ filters: [{ services: [BLE_UUIDS.service] }] });
      if (!active || operation !== this.#operation) return;
      probe = device;
      this.#probes.add(device);
      const desktop = await this.#readDesktop(device, operation);
      if (!active || operation !== this.#operation) return;
      if (desktop) onDesktop(desktop);
    })().catch((error: unknown) => {
      if (!active || operation !== this.#operation) return;
      onError(isCancellation(error) ? new BluetoothDeviceSelectionCancelledError() : new Error('Bluetooth discovery failed.'));
    });
    return () => {
      if (!active) return;
      active = false;
      if (operation === this.#operation) this.#operation += 1;
      if (probe) this.#releaseProbe(probe);
    };
  }

  async connect(peripheralId: string): Promise<void> {
    await this.disconnect();
    const operation = ++this.#operation;
    const device = this.#devices.get(peripheralId) ?? await this.#rememberedDevice((candidate) => candidate.id === peripheralId);
    if (!device) throw new Error('This PC is not available to the browser. Choose it again.');
    await this.#open(device, operation);
  }

  async resolveAndConnect(desktopId: string): Promise<DiscoveredDesktop> {
    await this.disconnect();
    const operation = ++this.#operation;
    this.#recordStage('resolution', 'started', operation);
    try {
      const known = this.#desktopDevices.get(desktopId);
      let device = known ? this.#devices.get(known) ?? null : null;
      device ??= await this.#rememberedDevice(() => true, desktopId, operation);
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      if (!device) {
        const bluetooth = this.bluetooth();
        if (!bluetooth) throw new Error('Web Bluetooth is unavailable.');
        device = await bluetooth.requestDevice({ filters: [{ services: [BLE_UUIDS.service] }] });
        this.#devices.set(device.id, device);
      }
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      const status = await this.#open(device, operation);
      this.#recordStage('selected_match', status.desktopId === desktopId ? 'succeeded' : 'not_matched', operation);
      if (status.desktopId !== desktopId) throw new Error('The chosen device is a different PC.');
      this.#recordStage('resolution', 'succeeded', operation);
      return this.#describe(device, status);
    } catch (error) {
      this.#recordStage('resolution', 'failed', operation);
      if (operation === this.#operation) await this.disconnect();
      throw isCancellation(error) ? new BluetoothDeviceSelectionCancelledError() : error;
    }
  }

  async disconnect(): Promise<void> {
    this.#operation += 1;
    this.#responsePoller?.stop();
    this.#responsePoller = null;
    this.#notificationsReady = null;
    this.#cancelTimers();
    await this.cancelPendingWrites();
    this.#writePoisoned = false;
    for (const probe of [...this.#probes]) this.#releaseProbe(probe);
    const session = this.#session;
    this.#session = null;
    if (session?.server.connected) {
      try { session.server.disconnect(); } catch { /* Already disconnected. */ }
    }
  }

  maxWriteValueBytes(): number {
    this.#requireSession();
    return WEB_MAX_WRITE_VALUE_BYTES;
  }

  async writeFrame(frameBase64: string): Promise<void> {
    const session = this.#requireSession();
    if (this.#writePoisoned) throw new Error('Bluetooth writes are unavailable until reconnect.');
    const bytes = new Uint8Array(toByteArray(frameBase64));
    if (bytes.length > WEB_MAX_WRITE_VALUE_BYTES) throw new Error('Bluetooth frame is too large.');
    await this.#bounded(this.#gatt(() => session.characteristics.receive.writeValueWithResponse(bytes), true), 'Bluetooth write timed out.');
  }

  async cancelPendingWrites(): Promise<void> {
    const error = new Error('Bluetooth write was cancelled.');
    const queued = this.#queue.filter((item) => item.write);
    this.#queue = this.#queue.filter((item) => !item.write);
    queued.forEach((item) => item.reject(error));
    // Web Bluetooth cannot abort a write already sent to the PC.
    if (this.#running?.write) this.#writePoisoned = true;
  }

  async verifyConnection(desktopId: string): Promise<boolean> {
    const session = this.#session;
    if (!session?.server.connected) return false;
    try {
      const view = await this.#bounded(this.#gatt(() => session.characteristics.status.readValue()), 'Bluetooth operation timed out.', Math.min(4_000, this.timeoutMs));
      return this.#session === session && decodeStatus(view)?.desktopId === desktopId;
    } catch {
      return false;
    }
  }

  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe {
    const session = this.#requireSession();
    const operation = this.#operation;
    if (session.readReplies) {
      const response = session.characteristics.response;
      if (!response || this.#responsePoller || this.#writePoisoned) throw new Error('Reconnect before starting response reads again.');
      const poller = new ReadResponsePoller(
        async () => toBase64(await this.#gatt(() => response.readValue())),
        async () => undefined,
        (frame) => { if (operation === this.#operation) onFrame(frame); },
        (error) => { if (operation === this.#operation) { this.#writePoisoned = true; onError(error); } },
        this.timeoutMs,
      );
      this.#responsePoller = poller;
      return () => { poller.stop(); if (this.#responsePoller === poller) this.#writePoisoned = true; };
    }
    const transmit = session.characteristics.transmit;
    let active = true;
    const listener = (event: Event) => {
      if (!active || operation !== this.#operation) return;
      const value = (event.target as WebBluetoothCharacteristic | null)?.value;
      if (value) onFrame(toBase64(value));
    };
    transmit.addEventListener('characteristicvaluechanged', listener);
    this.#recordStage('notifications', 'started', operation);
    const ready = this.#bounded(this.#gatt(() => transmit.startNotifications()), 'Bluetooth notifications timed out.').then(() => {
      this.#recordStage('notifications', 'succeeded', operation);
    }, (error: unknown) => {
      this.#recordStage('notifications', 'failed', operation);
      if (active && operation === this.#operation) onError(new Error('Bluetooth notifications could not be enabled.'));
      throw error;
    });
    void ready.catch(() => undefined);
    this.#notificationsReady = ready;
    return () => {
      active = false;
      transmit.removeEventListener('characteristicvaluechanged', listener);
      if (this.#session === session && session.server.connected) void this.#gatt(() => transmit.stopNotifications()).catch(() => undefined);
    };
  }

  async notificationsReady(): Promise<void> {
    if (this.#responsePoller) { await this.#responsePoller.ready; return; }
    if (!this.#notificationsReady) throw new Error('Bluetooth notifications have not started.');
    await this.#notificationsReady;
  }

  subscribeDisconnect(onDisconnect: () => void): Unsubscribe {
    const session = this.#requireSession();
    const listener = () => { if (this.#session === session) onDisconnect(); };
    session.device.addEventListener('gattserverdisconnected', listener);
    return () => session.device.removeEventListener('gattserverdisconnected', listener);
  }

  async #open(device: WebBluetoothDevice, operation: number): Promise<PcStatus> {
    this.#devices.set(device.id, device);
    this.#probes.delete(device);
    const gatt = device.gatt;
    if (!gatt) throw new Error('This device does not support Bluetooth connections.');
    const server = await this.#stage('connect', () => this.#bounded(gatt.connect(), 'Bluetooth operation timed out.'), operation);
    if (operation !== this.#operation) { server.disconnect(); throw new Error('Bluetooth connection was cancelled.'); }
    try {
      const characteristics = await this.#stage('services', () => this.#bounded(this.#characteristics(server), 'Bluetooth operation timed out.'), operation);
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      const view = await this.#stage('status_read', () => this.#bounded(this.#gatt(() => characteristics.status.readValue()), 'Bluetooth operation timed out.'), operation);
      const status = decodeStatus(view);
      if (!status) throw new Error('Bluetooth discovery status is invalid.');
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      const readReplies = status.responseTransport === 'read-v1';
      if (readReplies && !characteristics.response) throw new Error('Bluetooth discovery status is invalid.');
      this.#desktopDevices.set(status.desktopId, device.id);
      this.#session = { device, server, characteristics, readReplies };
      this.#writePoisoned = false;
      return status;
    } catch (error) {
      try { server.disconnect(); } catch { /* Already disconnected. */ }
      throw error;
    }
  }

  async #characteristics(server: WebBluetoothServer): Promise<Characteristics> {
    const service = await server.getPrimaryService(BLE_UUIDS.service);
    const [receive, transmit, status, response] = await Promise.all([
      service.getCharacteristic(BLE_UUIDS.receive),
      service.getCharacteristic(BLE_UUIDS.transmit),
      service.getCharacteristic(BLE_UUIDS.status),
      service.getCharacteristic(BLE_UUIDS.response).catch(() => null),
    ]);
    return { receive, transmit, status, response };
  }

  async #readDesktop(device: WebBluetoothDevice, operation: number): Promise<DiscoveredDesktop | null> {
    const gatt = device.gatt;
    if (!gatt) return null;
    const server = await this.#stage('probe_connect', () => this.#bounded(gatt.connect(), 'Bluetooth operation timed out.'), operation);
    const service = await this.#stage('probe_services', () => this.#bounded(server.getPrimaryService(BLE_UUIDS.service), 'Bluetooth operation timed out.'), operation);
    const characteristic = await this.#bounded(service.getCharacteristic(BLE_UUIDS.status), 'Bluetooth operation timed out.');
    const view = await this.#stage('status_read', () => this.#bounded(this.#gatt(() => characteristic.readValue()), 'Bluetooth operation timed out.'), operation);
    this.#recordStage('status_parse', 'started', operation);
    const status = decodeStatus(view);
    this.#recordStage('status_parse', status ? 'succeeded' : 'failed', operation);
    if (!status) return null;
    this.#devices.set(device.id, device);
    this.#desktopDevices.set(status.desktopId, device.id);
    return this.#describe(device, status);
  }

  /** Devices this site was allowed before, where the browser supports remembering them. */
  async #rememberedDevice(matches: (device: WebBluetoothDevice) => boolean, desktopId?: string, operation = this.#operation): Promise<WebBluetoothDevice | null> {
    const bluetooth = this.bluetooth();
    if (!bluetooth?.getDevices) return null;
    let devices: WebBluetoothDevice[];
    try { devices = (await bluetooth.getDevices()).filter(matches); } catch { return null; }
    for (const device of devices) {
      this.#devices.set(device.id, device);
      if (desktopId === undefined) return device;
      if (this.#desktopDevices.get(desktopId) === device.id) return device;
    }
    if (desktopId === undefined) return null;
    for (const device of devices) {
      if (operation !== this.#operation) return null;
      try {
        const desktop = await this.#readDesktop(device, operation);
        this.#releaseProbe(device);
        if (desktop?.desktopId === desktopId) return device;
      } catch {
        this.#releaseProbe(device);
      }
    }
    return null;
  }

  #describe(device: WebBluetoothDevice, status: PcStatus): DiscoveredDesktop {
    return {
      ...status,
      displayName: desktopDisplayName(status, { name: device.name, localName: null }, 'web'),
      peripheralId: device.id,
      rssi: null,
    };
  }

  #releaseProbe(device: WebBluetoothDevice): void {
    this.#probes.delete(device);
    if (this.#session?.device === device) return;
    try { if (device.gatt?.connected) device.gatt.disconnect(); } catch { /* Already disconnected. */ }
  }

  /** Web Bluetooth rejects overlapping GATT operations, so they run one at a time. */
  #gatt<T>(start: () => Promise<T>, write = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#queue.push({ start, resolve: resolve as (value: unknown) => void, reject, write });
      this.#drain();
    });
  }

  #drain(): void {
    if (this.#running) return;
    const next = this.#queue.shift();
    if (!next) return;
    this.#running = next;
    let operation: Promise<unknown>;
    try { operation = next.start(); } catch (error) { operation = Promise.reject(error); }
    void operation.then(next.resolve, (error: unknown) => next.reject(error instanceof Error ? error : new Error('Bluetooth operation failed.'))).finally(() => {
      if (this.#running === next) this.#running = null;
      this.#drain();
    });
  }

  #bounded<T>(operation: Promise<T>, message: string, timeoutMs = this.timeoutMs): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (result: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#timers.delete(cancel);
        result();
      };
      const cancel = (error: Error) => finish(() => reject(error));
      const timer = setTimeout(() => cancel(new Error(message)), timeoutMs);
      this.#timers.add(cancel);
      void operation.then((value) => finish(() => resolve(value)), (error: unknown) => finish(() => reject(error instanceof Error ? error : new Error('Bluetooth operation failed.'))));
    });
  }

  #cancelTimers(): void {
    const error = new Error('Bluetooth operation was cancelled.');
    for (const cancel of [...this.#timers]) cancel(error);
  }

  #requireSession(): Session {
    if (!this.#session) throw new Error('No PC is connected.');
    return this.#session;
  }

  #recordStage(stage: ConnectionStage, outcome: ConnectionStageOutcome, operation: number): void {
    if (operation !== this.#operation) return;
    try { this.diagnostics?.addConnectionStage(stage, outcome); } catch { /* best effort */ }
  }

  async #stage<T>(stage: ConnectionStage, action: () => Promise<T>, operation: number): Promise<T> {
    this.#recordStage(stage, 'started', operation);
    try {
      const result = await action();
      this.#recordStage(stage, 'succeeded', operation);
      return result;
    } catch (error) {
      this.#recordStage(stage, 'failed', operation);
      throw error;
    }
  }
}
