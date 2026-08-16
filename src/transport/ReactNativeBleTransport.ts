import { Platform } from 'react-native';
import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';

import { BLE_UUIDS } from '@/domain/protocol/constants';
import { parseStatus } from '@/domain/protocol/responses';
import type { BleAvailability, BleTransport, DiscoveredDesktop, Unsubscribe } from './BleTransport';

export class ReactNativeBleTransport implements BleTransport {
  readonly #manager: BleManager;
  #device: Device | null = null;
  #operation = 0;
  #scanDevices = new Map<string, Device>();
  #connectQueue: Promise<void> = Promise.resolve();

  constructor(manager = new BleManager(), private readonly platform = Platform.OS) { this.#manager = manager; }

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
    try {
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      connected = await this.#manager.connectToDevice(peripheralId);
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      this.#device = connected;
      if (this.platform === 'android') {
        connected = await connected.requestMTU(517);
        if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
        this.#device = connected;
      }
      connected = await connected.discoverAllServicesAndCharacteristics();
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      this.#device = connected;
    } catch (error) {
      if (connected) await connected.cancelConnection().catch(() => undefined);
      if (operation === this.#operation) this.#device = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.#operation += 1;
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
      const raw = new TextDecoder().decode(Uint8Array.from(atob(characteristic.value), (char) => char.charCodeAt(0)));
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
}
