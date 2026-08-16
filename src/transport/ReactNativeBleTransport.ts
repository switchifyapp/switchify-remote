import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';

import { BLE_UUIDS } from '@/domain/protocol/constants';
import { parseStatus } from '@/domain/protocol/responses';
import type { BleTransport, DiscoveredDesktop, Unsubscribe } from './BleTransport';

export class ReactNativeBleTransport implements BleTransport {
  readonly #manager: BleManager;
  #device: Device | null = null;

  constructor(manager = new BleManager()) { this.#manager = manager; }

  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe {
    let active = true;
    this.#manager.startDeviceScan([BLE_UUIDS.service], null, (error, device) => {
      if (!active) return;
      if (error) { onError(error); return; }
      if (!device) return;
      void this.#readStatus(device).then((desktop) => { if (active && desktop) onDesktop(desktop); }).catch(() => undefined);
    });
    return () => { active = false; this.#manager.stopDeviceScan(); };
  }

  async connect(peripheralId: string): Promise<void> {
    await this.disconnect();
    this.#device = await (await this.#manager.connectToDevice(peripheralId)).discoverAllServicesAndCharacteristics();
  }

  async disconnect(): Promise<void> {
    const device = this.#device;
    this.#device = null;
    if (device && await device.isConnected()) await device.cancelConnection();
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
