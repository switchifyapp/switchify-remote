import { Platform } from 'react-native';
import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';
import { toByteArray } from 'base64-js';

import { BLE_DESCRIPTORS, BLE_UUIDS } from '@/domain/protocol/constants';
import { parseStatus } from '@/domain/protocol/responses';
import type { BleAvailability, BleTransport, DiscoveredDesktop, Unsubscribe } from './BleTransport';
import { desktopDisplayName } from './desktopDisplayName';

export class ReactNativeBleTransport implements BleTransport {
  readonly #manager: BleManager;
  #device: Device | null = null;
  #operation = 0;
  #scanDevices = new Map<string, Device>();
  #scanKeys = new Set<string>();
  #scanTasks = new Set<Promise<void>>();
  #connectQueue: Promise<void> = Promise.resolve();
  #nativeCancels = new Set<(error: Error) => void>();
  #writeCancels = new Map<string, (error: Error) => void>();
  #connectingPeripheralId: string | null = null;
  #resolutionCancel: ((error: Error) => Promise<void>) | null = null;
  #writeSequence = 0;
  #writePoisoned = false;

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
      if (!device || this.#scanDevices.has(device.id) || this.#scanKeys.has(this.#scanKey(device)) || this.#scanDevices.size >= 4) return;
      const scanKey = this.#scanKey(device);
      let retainCompletedKey = false;
      this.#scanDevices.set(device.id, device);
      this.#scanKeys.add(scanKey);
      const task = this.#readStatus(device).then((desktop) => {
        // Windows commonly rotates its private BLE address while retaining the
        // computer name. Keep that name claimed for this scan after a
        // successful probe so one PC cannot repeatedly open GATT connections.
        // macOS uses the shared name "Switchify PC", so its key must be
        // released after each probe to allow multiple Macs to be discovered.
        retainCompletedKey = desktop?.platform === 'windows' && scanKey.startsWith('name:');
        if (active && operation === this.#operation && desktop) onDesktop(desktop);
      }).catch(() => undefined).finally(() => {
        if (operation === this.#operation) {
          this.#scanDevices.delete(device.id);
          if (!retainCompletedKey) this.#scanKeys.delete(scanKey);
        }
      });
      this.#scanTasks.add(task);
      void task.finally(() => this.#scanTasks.delete(task));
    });
    return () => {
      if (!active) return;
      active = false;
      if (operation === this.#operation) this.#operation += 1;
      this.#manager.stopDeviceScan();
      this.#cancelNativeOperations();
      const probes = [...this.#scanDevices.values()];
      this.#scanDevices.clear();
      this.#scanKeys.clear();
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

  async resolveAndConnect(desktopId: string): Promise<DiscoveredDesktop> {
    await this.disconnect();
    const operation = ++this.#operation;
    return new Promise<DiscoveredDesktop>((resolve, reject) => {
      let active = true;
      let claimedDeviceId: string | null = null;
      let cancellation: Promise<void> | null = null;
      const succeed = (desktop: DiscoveredDesktop) => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        this.#manager.stopDeviceScan();
        this.#scanKeys.clear();
        if (this.#resolutionCancel === cancel) this.#resolutionCancel = null;
        resolve(desktop);
      };
      const cancel = (error: Error): Promise<void> => {
        if (!active) return cancellation ?? Promise.resolve();
        active = false;
        clearTimeout(timer);
        this.#manager.stopDeviceScan();
        const probes = [...this.#scanDevices.values()];
        const retained = this.#device;
        this.#device = null;
        this.#scanDevices.clear();
        this.#scanKeys.clear();
        this.#cancelNativeOperations();
        const connections = retained && !probes.some((probe) => probe.id === retained.id) ? [...probes, retained] : probes;
        cancellation = Promise.allSettled(connections.map((connection) => this.#bounded(
          connection.cancelConnection(),
          this.#cancellationTimeout(),
        ))).then(() => {
          if (this.#resolutionCancel === cancel) this.#resolutionCancel = null;
          reject(error);
        });
        return cancellation;
      };
      this.#resolutionCancel = cancel;
      const timer = setTimeout(() => { void cancel(new Error('Saved PC discovery timed out.')); }, this.nativeTimeoutMs);
      const onAdvertisement = (error: Error | null, device: Device | null) => {
        if (!active || operation !== this.#operation) return;
        if (error) { void cancel(new Error('Saved PC discovery failed.')); return; }
        if (!device || this.#scanDevices.has(device.id) || this.#scanKeys.has(this.#scanKey(device)) || this.#scanDevices.size >= 4) return;
        this.#scanDevices.set(device.id, device);
        this.#scanKeys.add(this.#scanKey(device));
        const task = this.#readStatus(device, (desktop) => {
          if (desktop.desktopId !== desktopId || claimedDeviceId !== null) return false;
          claimedDeviceId = device.id;
          return true;
        }).then(async (desktop) => {
          if (!active || operation !== this.#operation || desktop?.desktopId !== desktopId || claimedDeviceId !== device.id) return;
          this.#scanDevices.delete(device.id);
          this.#manager.stopDeviceScan();
          const otherProbes = [...this.#scanDevices.values()];
          this.#scanDevices.clear();
          otherProbes.forEach((probe) => { void probe.cancelConnection().catch(() => undefined); });
          let connected = this.#requireDevice();
          if (this.platform === 'android') {
            connected = await this.#bounded(connected.requestMTU(517));
            if (!active || operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
            this.#device = connected;
          }
          connected = await this.#bounded(connected.discoverAllServicesAndCharacteristics());
          if (!active || operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
          this.#device = connected;
          this.#writePoisoned = false;
          succeed(desktop);
        }).catch((probeError: unknown) => {
          if (this.#device?.id === device.id) {
            void cancel(probeError instanceof Error ? probeError : new Error('Saved PC discovery failed.'));
          }
        }).finally(() => {
          if (operation === this.#operation) {
            this.#scanDevices.delete(device.id);
            this.#scanKeys.delete(this.#scanKey(device));
          }
        });
        this.#scanTasks.add(task);
        void task.finally(() => this.#scanTasks.delete(task));
      };
      try {
        this.#manager.startDeviceScan([BLE_UUIDS.service], null, onAdvertisement);
      } catch {
        void cancel(new Error('Saved PC discovery failed.'));
      }
    });
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
      this.#writePoisoned = false;
    } catch (error) {
      connectCancelled = true;
      if (connected) await this.#bounded(connected.cancelConnection(), this.#cancellationTimeout()).catch(() => undefined);
      else void this.#manager.cancelDeviceConnection(peripheralId).catch(() => undefined);
      if (operation === this.#operation) this.#device = null;
      throw error;
    } finally {
      if (this.#connectingPeripheralId === peripheralId) this.#connectingPeripheralId = null;
    }
  }

  async disconnect(): Promise<void> {
    this.#operation += 1;
    const cancelResolution = this.#resolutionCancel;
    if (cancelResolution) await cancelResolution(new Error('Bluetooth operation was cancelled.'));
    this.#cancelNativeOperations();
    await this.cancelPendingWrites();
    const connectingPeripheralId = this.#connectingPeripheralId;
    this.#connectingPeripheralId = null;
    if (connectingPeripheralId) void this.#manager.cancelDeviceConnection(connectingPeripheralId).catch(() => undefined);
    this.#manager.stopDeviceScan();
    const probes = [...this.#scanDevices.values()];
    this.#scanDevices.clear();
    this.#scanKeys.clear();
    probes.forEach((probe) => { void probe.cancelConnection().catch(() => undefined); });
    await Promise.allSettled([...this.#scanTasks]);
    const device = this.#device;
    this.#device = null;
    if (device) await this.#bounded(device.cancelConnection(), this.#cancellationTimeout()).catch(() => undefined);
  }

  maxWriteValueBytes(): number {
    return Math.max(0, (this.#requireDevice().mtu ?? 23) - 3);
  }

  async writeFrame(frameBase64: string): Promise<void> {
    const device = this.#requireDevice();
    if (this.#writePoisoned) throw new Error('Bluetooth writes are unavailable until reconnect.');
    const transactionId = `switchify-write-${++this.#writeSequence}`;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (result: 'resolve' | 'reject', error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#writeCancels.delete(transactionId);
        if (result === 'resolve') resolve(); else reject(error ?? new Error('Bluetooth write failed.'));
      };
      const cancel = (error: Error) => finish('reject', error);
      const timer = setTimeout(() => { void this.#cancelWriteTransaction(transactionId).finally(() => cancel(new Error('Bluetooth write timed out.'))); }, this.nativeTimeoutMs);
      this.#writeCancels.set(transactionId, cancel);
      void device.writeCharacteristicWithResponseForService(BLE_UUIDS.service, BLE_UUIDS.receive, frameBase64, transactionId).then(() => finish('resolve'), (error: unknown) => finish('reject', error instanceof Error ? error : new Error('Bluetooth write failed.')));
    });
  }

  async cancelPendingWrites(): Promise<void> {
    const operations = [...this.#writeCancels.entries()];
    const error = new Error('Bluetooth write was cancelled.');
    await Promise.all(operations.map(([transactionId]) => this.#cancelWriteTransaction(transactionId)));
    operations.forEach(([, cancel]) => cancel(error));
  }

  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe {
    const subscription: Subscription = this.#requireDevice().monitorCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.transmit, (error, characteristic) => {
      if (error) onError(error);
      else if (characteristic?.value) onFrame(characteristic.value);
    });
    return () => subscription.remove();
  }

  async notificationsReady(): Promise<void> {
    if (this.platform !== 'android') return;
    const descriptor = await this.#bounded(this.#requireDevice().readDescriptorForService(
      BLE_UUIDS.service,
      BLE_UUIDS.transmit,
      BLE_DESCRIPTORS.clientCharacteristicConfiguration,
    ));
    if (descriptor.value !== 'AQA=') throw new Error('Bluetooth notifications could not be enabled.');
  }

  subscribeDisconnect(onDisconnect: () => void): Unsubscribe {
    const device = this.#requireDevice();
    const subscription = this.#manager.onDeviceDisconnected(device.id, () => onDisconnect());
    return () => subscription.remove();
  }

  async #readStatus(device: Device, retain = (_desktop: DiscoveredDesktop) => false): Promise<DiscoveredDesktop | null> {
    let connectedHere = false;
    let target = device;
    let probeFinished = false;
    try {
      connectedHere = !(await this.#bounded(device.isConnected()));
      if (connectedHere) {
        const nativeConnect = device.connect();
        void nativeConnect.then((connected) => {
          if (probeFinished) void connected.cancelConnection().catch(() => undefined);
        }, () => undefined);
        target = await this.#bounded(nativeConnect);
      }
      await this.#bounded(target.discoverAllServicesAndCharacteristics());
      const characteristic = await this.#bounded(target.readCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.status));
      if (!characteristic.value) return null;
      const raw = new TextDecoder().decode(toByteArray(characteristic.value));
      const status = parseStatus(raw);
      const desktop = status ? {
        ...status,
        displayName: desktopDisplayName(status, device.name),
        peripheralId: device.id,
        rssi: device.rssi ?? null,
      } : null;
      if (desktop && retain(desktop)) {
        this.#device = target;
        connectedHere = false;
      }
      return desktop;
    } finally {
      probeFinished = true;
      if (connectedHere) await this.#bounded(target.cancelConnection(), this.#cancellationTimeout()).catch(() => undefined);
    }
  }

  #requireDevice(): Device {
    if (!this.#device) throw new Error('No PC is connected.');
    return this.#device;
  }

  #scanKey(device: Device): string {
    return device.name ? `name:${device.name}` : `id:${device.id}`;
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

  #cancelNativeOperations(): void {
    const cancellation = new Error('Bluetooth operation was cancelled.');
    for (const cancel of [...this.#nativeCancels]) cancel(cancellation);
  }

  async #cancelWriteTransaction(transactionId: string): Promise<void> {
    let completed = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.#cancellationTimeout());
      void this.#manager.cancelTransaction(transactionId).then(() => {
        completed = true;
        clearTimeout(timer);
        resolve();
      }, () => { clearTimeout(timer); resolve(); });
    });
    if (!completed) this.#writePoisoned = true;
  }

  #cancellationTimeout(): number { return Math.min(1_000, this.nativeTimeoutMs); }
}
