import { fromByteArray, toByteArray } from 'base64-js';

import { BLE_UUIDS } from '@/domain/protocol/constants';
import { parseStatus } from '@/domain/protocol/responses';
import type { PcStatus } from '@/domain/protocol/types';
import type { ConnectionStage, ConnectionStageOutcome, DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import { BluetoothDeviceSelectionCancelledError, BluetoothPickerBlockedError, type BleAvailability, type BleTransport, type DiscoveredDesktop, type Unsubscribe } from './BleTransport';
import { desktopDisplayName } from './desktopDisplayName';
import { ReadResponsePoller } from './ReadResponsePoller';

/**
 * Web Bluetooth does not report the negotiated MTU and macOS Switchify PC rejects
 * long (offset) writes, so frames stay within a 185-byte ATT MTU.
 */
export const WEB_MAX_WRITE_VALUE_BYTES = 182;

/**
 * Browsers only open the device picker within a few seconds of a tap, so checking
 * remembered devices must finish well inside that window.
 */
export const REMEMBERED_DEVICE_BUDGET_MS = 3_000;

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

type Pending = { start: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: Error) => void; write: boolean; done: Promise<void> };

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

function errorName(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
}

function isPickerOutcome(error: unknown): error is Error {
  return error instanceof BluetoothDeviceSelectionCancelledError || error instanceof BluetoothPickerBlockedError;
}

function cancelled(): Error {
  return new Error('Bluetooth connection was cancelled.');
}

export class WebBluetoothTransport implements BleTransport {
  #operation = 0;
  #session: Session | null = null;
  #devices = new Map<string, WebBluetoothDevice>();
  #desktopDevices = new Map<string, string>();
  /** The connect attempt allowed to close each device's connection, so a stale attempt never closes a newer one. */
  #owners = new Map<string, number>();
  #attempts = 0;
  #probes = new Map<WebBluetoothDevice, number>();
  #discoveredProbe: { device: WebBluetoothDevice; server: WebBluetoothServer; service: WebBluetoothService; desktopId: string; attempt: number; retained: boolean } | null = null;
  #queue: Pending[] = [];
  #running: Pending | null = null;
  #queueGeneration = 0;
  #writePoisoned = false;
  #responsePoller: ReadResponsePoller | null = null;
  #notificationsReady: Promise<void> | null = null;
  #timers = new Set<(error: Error) => void>();

  constructor(
    private readonly bluetooth: () => WebBluetooth | null = navigatorBluetooth,
    private readonly timeoutMs = 10_000,
    private readonly diagnostics?: Pick<DiagnosticLog, 'addConnectionStage'>,
    private readonly now: () => number = Date.now,
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
      const device = await this.#choose();
      if (!active || operation !== this.#operation) return;
      probe = device;
      const desktop = await this.#readDesktop(device, operation);
      if (!active || operation !== this.#operation) return;
      if (!desktop) throw new Error('Bluetooth discovery status is invalid.');
      onDesktop(desktop);
    })().catch((error: unknown) => {
      if (!active || operation !== this.#operation) return;
      onError(isPickerOutcome(error) ? error : new Error('Bluetooth discovery failed.'));
    });
    return () => {
      if (!active) return;
      active = false;
      if (operation === this.#operation) this.#operation += 1;
      const attempt = probe ? this.#probes.get(probe) : undefined;
      if (probe && attempt !== undefined && !(this.#discoveredProbe?.device === probe && this.#discoveredProbe.retained)) this.#releaseProbe(probe, attempt);
    };
  }

  retainDiscoveredConnection(desktopId: string): boolean {
    const probe = this.#discoveredProbe;
    if (!probe || probe.desktopId !== desktopId || !probe.server.connected || this.#session || this.#owners.get(probe.device.id) !== probe.attempt) return false;
    probe.retained = true;
    return true;
  }

  async connect(peripheralId: string): Promise<void> {
    const operation = ++this.#operation;
    await this.#disconnectExceptDiscovery(undefined, operation);
    if (operation !== this.#operation) throw cancelled();
    let device = this.#devices.get(peripheralId) ?? null;
    if (!device) {
      const remembered = await this.#rememberedDevices();
      device = remembered.find((candidate) => candidate.id === peripheralId) ?? null;
    }
    if (operation !== this.#operation) throw cancelled();
    if (!device) throw new Error('This PC is not available to the browser. Choose it again.');
    await this.#open(device, operation);
  }

  async resolveAndConnect(desktopId: string): Promise<DiscoveredDesktop> {
    const operation = ++this.#operation;
    await this.#disconnectExceptDiscovery(desktopId, operation);
    if (operation !== this.#operation) throw cancelled();
    this.#recordStage('resolution', 'started', operation);
    let device: WebBluetoothDevice | null = null;
    try {
      const known = this.#desktopDevices.get(desktopId);
      device = known ? this.#devices.get(known) ?? null : null;
      device ??= await this.#findRememberedDesktop(desktopId, operation);
      if (operation !== this.#operation) throw cancelled();
      if (!device) {
        device = await this.#choose();
        this.#devices.set(device.id, device);
      }
      if (operation !== this.#operation) throw cancelled();
      const status = await this.#open(device, operation);
      this.#recordStage('selected_match', status.desktopId === desktopId ? 'succeeded' : 'not_matched', operation);
      if (status.desktopId !== desktopId) throw new Error('The chosen device is a different PC.');
      this.#recordStage('resolution', 'succeeded', operation);
      return this.#describe(device, status);
    } catch (error) {
      this.#recordStage('resolution', 'failed', operation);
      // A PC can change its Bluetooth address (Windows rotates it). Forget a device that
      // failed so the next attempt looks it up again or asks through the picker.
      if (operation === this.#operation && device && this.#desktopDevices.get(desktopId) === device.id) this.#desktopDevices.delete(desktopId);
      if (operation === this.#operation) await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.#disconnectExceptDiscovery();
  }

  async #disconnectExceptDiscovery(desktopId?: string, operation = ++this.#operation): Promise<void> {
    this.#responsePoller?.stop();
    this.#responsePoller = null;
    this.#notificationsReady = null;
    this.#cancelTimers();
    await this.cancelPendingWrites();
    if (operation !== this.#operation) return;
    this.#resetQueue();
    this.#writePoisoned = false;
    for (const [probe, attempt] of [...this.#probes]) {
      const ready = this.#discoveredProbe;
      if (desktopId !== undefined && ready?.retained && ready.desktopId === desktopId && ready.device === probe && ready.server.connected) continue;
      this.#releaseProbe(probe, attempt);
    }
    const session = this.#session;
    this.#session = null;
    if (session) {
      this.#owners.delete(session.device.id);
      if (session.server.connected) {
        try { session.server.disconnect(); } catch { /* Already disconnected. */ }
      }
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

  /**
   * Drops queued writes. Web Bluetooth cannot abort a write already sent, so this
   * waits briefly for it; only a write that never settles makes writes unavailable
   * until reconnect. Cleanup commands sent after cancelling therefore still reach the PC.
   */
  async cancelPendingWrites(): Promise<void> {
    const error = new Error('Bluetooth write was cancelled.');
    const queued = this.#queue.filter((item) => item.write);
    this.#queue = this.#queue.filter((item) => !item.write);
    queued.forEach((item) => item.reject(error));
    const running = this.#running;
    if (!running?.write) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      running.done.then(() => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), this.#cancellationTimeout()); }),
    ]);
    clearTimeout(timer);
    if (!settled && this.#running === running) this.#writePoisoned = true;
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
    const probe = this.#discoveredProbe;
    const reusable = probe?.device === device && probe.server.connected && this.#owners.get(device.id) === probe.attempt ? probe : null;
    if (probe?.device === device) this.#discoveredProbe = null;
    this.#probes.delete(device);
    const attempt = ++this.#attempts;
    this.#owners.set(device.id, attempt);
    try {
      const server = reusable?.server ?? await this.#connectGatt(device, operation, attempt, 'connect');
      if (reusable) this.#recordStage('discovery_handoff', 'succeeded', operation);
      const { characteristics, status } = await this.#stage('services', () => this.#characteristics(server, operation, reusable?.service), operation);
      if (operation !== this.#operation) throw cancelled();
      const readReplies = status.responseTransport === 'read-v1';
      if (readReplies && !characteristics.response) throw new Error('Bluetooth discovery status is invalid.');
      this.#desktopDevices.set(status.desktopId, device.id);
      this.#session = { device, server, characteristics, readReplies };
      this.#writePoisoned = false;
      return status;
    } catch (error) {
      this.#closeIfOwner(device, attempt);
      throw error;
    }
  }

  /**
   * Opens the browser's device picker. Only its errors mean the person closed the picker
   * (NotFoundError) or the browser would not open it (SecurityError); the same names from
   * later GATT steps are ordinary connection failures.
   */
  async #choose(): Promise<WebBluetoothDevice> {
    const bluetooth = this.bluetooth();
    if (!bluetooth) throw new Error('Web Bluetooth is unavailable.');
    try {
      return await bluetooth.requestDevice({ filters: [{ services: [BLE_UUIDS.service] }] });
    } catch (error) {
      if (errorName(error) === 'NotFoundError') throw new BluetoothDeviceSelectionCancelledError();
      if (errorName(error) === 'SecurityError') throw new BluetoothPickerBlockedError();
      throw error;
    }
  }

  /** Connects, and closes the connection if it only completes after the attempt was abandoned. */
  async #connectGatt(device: WebBluetoothDevice, operation: number, attempt: number, stage: ConnectionStage, timeoutMs = this.timeoutMs): Promise<WebBluetoothServer> {
    const gatt = device.gatt;
    if (!gatt) throw new Error('This device does not support Bluetooth connections.');
    let abandoned = false;
    const connecting = gatt.connect();
    void connecting.then(() => {
      if (abandoned || operation !== this.#operation) this.#closeIfOwner(device, attempt);
    }, () => undefined);
    try {
      const server = await this.#stage(stage, () => this.#bounded(connecting, 'Bluetooth operation timed out.', timeoutMs), operation);
      if (operation !== this.#operation) throw cancelled();
      return server;
    } catch (error) {
      abandoned = true;
      throw error;
    }
  }

  async #characteristics(server: WebBluetoothServer, operation: number, discoveredService?: WebBluetoothService): Promise<{ characteristics: Characteristics; status: PcStatus }> {
    const deadline = this.now() + this.timeoutMs;
    const step = async <T>(stage: ConnectionStage, action: () => Promise<T>): Promise<T> => {
      if (operation !== this.#operation) throw cancelled();
      const remaining = deadline - this.now();
      if (remaining <= 0) throw new Error('Bluetooth operation timed out.');
      const result = await this.#stage(stage, () => this.#bounded(action(), 'Bluetooth operation timed out.', remaining), operation);
      if (operation !== this.#operation) throw cancelled();
      return result;
    };
    // Discovery is sequential too. Do not ask notification-based PCs for the
    // read-v1 characteristic that they do not expose.
    const service = discoveredService ?? await step('primary_service', () => server.getPrimaryService(BLE_UUIDS.service));
    const statusCharacteristic = await step('status_characteristic', () => service.getCharacteristic(BLE_UUIDS.status));
    const view = await step('status_read', () => statusCharacteristic.readValue());
    const status = decodeStatus(view);
    this.#recordStage('status_parse', status ? 'succeeded' : 'failed', operation);
    if (!status) throw new Error('Bluetooth discovery status is invalid.');
    const receive = await step('receive_characteristic', () => service.getCharacteristic(BLE_UUIDS.receive));
    const transmit = await step('transmit_characteristic', () => service.getCharacteristic(BLE_UUIDS.transmit));
    const response = status.responseTransport === 'read-v1'
      ? await step('response_characteristic', () => service.getCharacteristic(BLE_UUIDS.response))
      : null;
    return { characteristics: { receive, transmit, status: statusCharacteristic, response }, status };
  }

  /** Reads a device's status over a short-lived probe connection with its own connect attempt. */
  async #readDesktop(device: WebBluetoothDevice, operation: number, timeoutMs = this.timeoutMs): Promise<DiscoveredDesktop | null> {
    const attempt = ++this.#attempts;
    this.#probes.set(device, attempt);
    this.#owners.set(device.id, attempt);
    const deadline = this.now() + timeoutMs;
    const remaining = () => Math.max(1, deadline - this.now());
    try {
      const server = await this.#connectGatt(device, operation, attempt, 'probe_connect', remaining());
      const service = await this.#stage('probe_services', () => this.#bounded(server.getPrimaryService(BLE_UUIDS.service), 'Bluetooth operation timed out.', remaining()), operation);
      if (operation !== this.#operation) throw cancelled();
      const characteristic = await this.#bounded(service.getCharacteristic(BLE_UUIDS.status), 'Bluetooth operation timed out.', remaining());
      if (operation !== this.#operation) throw cancelled();
      // Probe operations are sequential on a disposable connection, not the session
      // queue. A timed-out read must not block a subsequently chosen PC.
      const view = await this.#stage('status_read', () => this.#bounded(characteristic.readValue(), 'Bluetooth operation timed out.', remaining()), operation);
      if (operation !== this.#operation) throw cancelled();
      this.#recordStage('status_parse', 'started', operation);
      const status = decodeStatus(view);
      this.#recordStage('status_parse', status ? 'succeeded' : 'failed', operation);
      if (!status) {
        this.#releaseProbe(device, attempt);
        return null;
      }
      if (operation !== this.#operation) throw cancelled();
      this.#discoveredProbe = { device, server, service, desktopId: status.desktopId, attempt, retained: false };
      this.#devices.set(device.id, device);
      this.#desktopDevices.set(status.desktopId, device.id);
      return this.#describe(device, status);
    } catch (error) {
      this.#releaseProbe(device, attempt);
      throw error;
    }
  }

  async #rememberedDevices(): Promise<WebBluetoothDevice[]> {
    const bluetooth = this.bluetooth();
    if (!bluetooth?.getDevices) return [];
    try {
      const devices = await bluetooth.getDevices();
      devices.forEach((device) => this.#devices.set(device.id, device));
      return devices;
    } catch {
      return [];
    }
  }

  /** Looks for a saved PC among devices this site may already use, within the picker's tap window. */
  async #findRememberedDesktop(desktopId: string, operation: number): Promise<WebBluetoothDevice | null> {
    const deadline = this.now() + REMEMBERED_DEVICE_BUDGET_MS;
    const devices = await this.#rememberedDevices();
    const mapped = devices.find((device) => this.#desktopDevices.get(desktopId) === device.id);
    if (mapped) return mapped;
    for (const device of devices) {
      const remaining = deadline - this.now();
      if (operation !== this.#operation || remaining <= 0) return null;
      try {
        const desktop = await this.#readDesktop(device, operation, remaining);
        if (desktop?.desktopId === desktopId) return device;
        const attempt = this.#probes.get(device);
        if (attempt !== undefined) this.#releaseProbe(device, attempt);
      } catch {
        // An unreachable or unrelated device is skipped; the picker remains the fallback.
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

  #releaseProbe(device: WebBluetoothDevice, attempt: number): void {
    if (this.#discoveredProbe?.device === device && this.#discoveredProbe.attempt === attempt) this.#discoveredProbe = null;
    if (this.#probes.get(device) === attempt) this.#probes.delete(device);
    this.#closeIfOwner(device, attempt);
  }

  #closeIfOwner(device: WebBluetoothDevice, attempt: number): void {
    if (this.#session?.device === device || this.#owners.get(device.id) !== attempt) return;
    // Ownership is kept while a connect is pending, so its late completion is still closed.
    if (!device.gatt?.connected) return;
    this.#owners.delete(device.id);
    try { device.gatt.disconnect(); } catch { /* Already disconnected. */ }
  }

  /** Web Bluetooth rejects overlapping GATT operations, so they run one at a time. */
  #gatt<T>(start: () => Promise<T>, write = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let finish!: () => void;
      const done = new Promise<void>((settle) => { finish = settle; });
      this.#queue.push({
        start,
        resolve: (value) => { finish(); resolve(value as T); },
        reject: (error) => { finish(); reject(error); },
        write,
        done,
      });
      this.#drain();
    });
  }

  #drain(): void {
    if (this.#running) return;
    const next = this.#queue.shift();
    if (!next) return;
    const generation = this.#queueGeneration;
    this.#running = next;
    let operation: Promise<unknown>;
    try { operation = next.start(); } catch (error) { operation = Promise.reject(error); }
    void operation.then(next.resolve, (error: unknown) => next.reject(error instanceof Error ? error : new Error('Bluetooth operation failed.'))).finally(() => {
      // An operation from before a disconnect may settle late; it no longer owns the queue.
      if (generation !== this.#queueGeneration) return;
      if (this.#running === next) this.#running = null;
      this.#drain();
    });
  }

  #resetQueue(): void {
    this.#queueGeneration += 1;
    const error = new Error('Bluetooth operation was cancelled.');
    const queued = this.#queue;
    this.#queue = [];
    this.#running = null;
    queued.forEach((item) => item.reject(error));
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

  #cancellationTimeout(): number { return Math.min(1_000, this.timeoutMs); }

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
