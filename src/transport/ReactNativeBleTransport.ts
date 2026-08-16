import { Platform } from 'react-native';
import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';
import { toByteArray } from 'base64-js';

import { BLE_UUIDS } from '@/domain/protocol/constants';
import { parseStatus } from '@/domain/protocol/responses';
import type { BleAvailability, BleTransport, DiscoveredDesktop, Unsubscribe } from './BleTransport';

export class ReactNativeBleTransport implements BleTransport {
  readonly #manager: BleManager;
  #device: Device | null = null;
  #operation = 0;
  #scanDevices = new Map<string, Device>();
  #connectQueue: Promise<void> = Promise.resolve();
  #nativeCancels = new Set<(error: Error) => void>();
  #connectingPeripheralId: string | null = null;

  constructor(manager = new BleManager(), private readonly platform = Platform.OS, private readonly nativeTimeoutMs = 10_000) { this.#manager = manager; }

  async availability(): Promise<BleAvailability> {
    const state = await this.#manager.state();
    if (state === 'PoweredOn') return 'ready';
    if (state === 'Unauthorized') return 'unauthorized';
    if (state === 'Unsupported') return 'unsupported';
    return 'poweredOff';
  }

  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe {
    const operation = ++this.#operation;
    let active = true;
    this.#manager.startDeviceScan([BLE_UUIDS.service], null, (error, device) => {
      if (!active || operation !== this.#operation) return;
      if (error) { onError(error); return; }
      if (!device || this.#scanDevices.has(device.id) || this.#scanDevices.size >= 4) return;
      this.#scanDevices.set(device.id, device);
      void this.#readStatus(device).then((desktop) => {
        if (active && operation === this.#operation && desktop) onDesktop(desktop);
      }).catch(() => undefined).finally(() => {
        if (operation === this.#operation) this.#scanDevices.delete(device.id);
      });
    });
    return () => {
      if (!active) return;
      active = false;
      if (operation === this.#operation) this.#operation += 1;
      this.#manager.stopDeviceScan();
      const probes = [...this.#scanDevices.values()];
      this.#scanDevices.clear();
      probes.forEach((device) => { void device.cancelConnection().catch(() => undefined); });
    };
  }

  async connect(peripheralId: string): Promise<void> {
    await this.disconnect();
    const operation = ++this.#operation;
    const result = this.#connectQueue.catch(() => undefined).then(() => this.#connect(peripheralId, operation));
    this.#connectQueue = result.then(() => undefined, () => undefined);
    await result;
  }

  async #connect(peripheralId: string, operation: number): Promise<void> {
    let connected: Device | null = null;
    let connectCancelled = false;
    this.#connectingPeripheralId = peripheralId;
    try {
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      const nativeConnect = this.#manager.connectToDevice(peripheralId);
      void nativeConnect.then((device) => {
        if (connectCancelled || operation !== this.#operation) void device.cancelConnection().catch(() => undefined);
      }, () => undefined);
      connected = await this.#bounded(nativeConnect);
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      this.#device = connected;
      if (this.platform === 'android') {
        connected = await this.#bounded(connected.requestMTU(517));
        if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
        this.#device = connected;
      }
      connected = await this.#bounded(connected.discoverAllServicesAndCharacteristics());
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      this.#device = connected;
    } catch (error) {
      connectCancelled = true;
      if (connected) await connected.cancelConnection().catch(() => undefined);
      else void this.#manager.cancelDeviceConnection(peripheralId).catch(() => undefined);
      if (operation === this.#operation) this.#device = null;
      throw error;
    } finally {
      if (this.#connectingPeripheralId === peripheralId) this.#connectingPeripheralId = null;
    }
  }

  async disconnect(): Promise<void> {
    this.#operation += 1;
    const cancellation = new Error('Bluetooth operation was cancelled.');
    for (const cancel of [...this.#nativeCancels]) cancel(cancellation);
    const connectingPeripheralId = this.#connectingPeripheralId;
    this.#connectingPeripheralId = null;
    if (connectingPeripheralId) void this.#manager.cancelDeviceConnection(connectingPeripheralId).catch(() => undefined);
    this.#manager.stopDeviceScan();
    const probes = [...this.#scanDevices.values()];
    this.#scanDevices.clear();
    probes.forEach((probe) => { void probe.cancelConnection().catch(() => undefined); });
    const device = this.#device;
    this.#device = null;
    if (device && await device.isConnected()) await device.cancelConnection();
  }

  maxWriteValueBytes(): number {
    return Math.max(0, (this.#requireDevice().mtu ?? 23) - 3);
  }

  async writeFrame(frameBase64: string): Promise<void> {
    const device = this.#requireDevice();
    await device.writeCharacteristicWithResponseForService(BLE_UUIDS.service, BLE_UUIDS.receive, frameBase64);
  }

  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe {
    const subscription: Subscription = this.#requireDevice().monitorCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.transmit, (error, characteristic) => {
      if (error) onError(error);
      else if (characteristic?.value) onFrame(characteristic.value);
    });
    return () => subscription.remove();
  }

  subscribeDisconnect(onDisconnect: () => void): Unsubscribe {
    const device = this.#requireDevice();
    const subscription = this.#manager.onDeviceDisconnected(device.id, () => onDisconnect());
    return () => subscription.remove();
  }

  async #readStatus(device: Device): Promise<DiscoveredDesktop | null> {
    const connectedHere = !(await device.isConnected());
    const target = connectedHere ? await device.connect() : device;
    try {
      await target.discoverAllServicesAndCharacteristics();
      const characteristic = await target.readCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.status);
      if (!characteristic.value) return null;
      const raw = new TextDecoder().decode(toByteArray(characteristic.value));
      const status = parseStatus(raw);
      return status ? { ...status, peripheralId: device.id, rssi: device.rssi ?? null } : null;
    } finally {
      if (connectedHere) await target.cancelConnection().catch(() => undefined);
    }
  }

  #requireDevice(): Device {
    if (!this.#device) throw new Error('No PC is connected.');
    return this.#device;
  }

  #bounded<T>(operation: Promise<T>, timeoutMs = this.nativeTimeoutMs): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (result: 'resolve' | 'reject', value: T | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#nativeCancels.delete(cancel);
        if (result === 'resolve') resolve(value as T); else reject(value);
      };
      const cancel = (error: Error) => finish('reject', error);
      timer = setTimeout(() => cancel(new Error('Bluetooth operation timed out.')), timeoutMs);
      this.#nativeCancels.add(cancel);
      void operation.then((value) => finish('resolve', value), (error: unknown) => finish('reject', error instanceof Error ? error : new Error('Bluetooth operation failed.')));
    });
  }
}
