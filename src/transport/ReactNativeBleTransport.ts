import { Platform } from 'react-native';
import { BleManager, ConnectionPriority, type Device, type State, type Subscription } from 'react-native-ble-plx';
import { toByteArray } from 'base64-js';

import { BLE_DESCRIPTORS, BLE_UUIDS } from '@/domain/protocol/constants';
import { parseStatus } from '@/domain/protocol/responses';
import type { ConnectionStage, ConnectionStageOutcome, DiagnosticLog, DiagnosticAttempt } from '@/diagnostics/DiagnosticLog';
import type { BleAvailability, BleTransport, DiscoveredDesktop, Unsubscribe } from './BleTransport';
import { desktopDisplayName } from './desktopDisplayName';
import { ReadResponsePoller } from './ReadResponsePoller';

export class ReactNativeBleTransport implements BleTransport {
  #manager: BleManager | null;
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
  #readReplies = false;
  #responsePoller: ReadResponsePoller | null = null;
  #diagnosticAttempt: DiagnosticAttempt | undefined;

  constructor(
    manager: BleManager | null = null,
    private readonly platform = Platform.OS,
    private readonly nativeTimeoutMs = 10_000,
    private readonly managerFactory = () => new BleManager(),
    private readonly diagnostics?: Pick<DiagnosticLog, 'addConnectionStage'> & Partial<Pick<DiagnosticLog, 'peerObserved'>>,
  ) { this.#manager = manager; }

  async availability(): Promise<BleAvailability> {
    const manager = this.#managerOrCreate();
    const state = await this.#settledManagerState(manager, await manager.state());
    if (state === 'PoweredOn') return 'ready';
    if (state === 'Unauthorized') return 'unauthorized';
    if (state === 'Unsupported') return 'unsupported';
    return 'poweredOff';
  }

  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe {
    this.#diagnosticAttempt = undefined;
    const operation = ++this.#operation;
    let active = true;
    const waiting = new Map<string, Device>();
    const onAdvertisement = (error: Error | null, device: Device | null) => {
      if (!active || operation !== this.#operation) return;
      if (error) { onError(error); return; }
      if (!device || this.#scanDevices.has(device.id) || this.#scanKeys.has(this.#scanKey(device))) return;
      if (this.#scanDevices.size >= 4) {
        if (waiting.size < 32) waiting.set(device.id, device);
        return;
      }
      waiting.delete(device.id);
      const scanKey = this.#scanKey(device);
      let retainCompletedKey = false;
      this.#scanDevices.set(device.id, device);
      this.#scanKeys.add(scanKey);
      const task = this.#readStatus(device).then((desktop) => {
        // Suppress repeats only for this peripheral. A rotated address must be
        // probed again: neither a shared nor a cached name establishes identity.
        // Cap retained keys so long scans cannot accumulate unbounded state.
        retainCompletedKey = desktop?.platform === 'windows';
        if (active && operation === this.#operation && retainCompletedKey && this.#scanKeys.size > 256) {
          const oldest = [...this.#scanKeys].find((key) => ![...this.#scanDevices.values()].some((peer) => this.#scanKey(peer) === key));
          if (oldest) this.#scanKeys.delete(oldest);
        }
        if (active && operation === this.#operation && desktop) onDesktop(desktop);
      }).catch(() => undefined).finally(() => {
        if (operation === this.#operation) {
          this.#scanDevices.delete(device.id);
          if (!retainCompletedKey) this.#scanKeys.delete(scanKey);
          const next = waiting.values().next().value;
          if (next) onAdvertisement(null, next);
        }
      });
      this.#scanTasks.add(task);
      void task.finally(() => this.#scanTasks.delete(task));
    };
    this.#managerOrCreate().startDeviceScan([BLE_UUIDS.service], null, onAdvertisement);
    return () => {
      if (!active) return;
      active = false;
      waiting.clear();
      if (operation === this.#operation) this.#operation += 1;
      this.#managerOrCreate().stopDeviceScan();
      this.#cancelNativeOperations();
      const probes = [...this.#scanDevices.values()];
      this.#scanDevices.clear();
      this.#scanKeys.clear();
      probes.forEach((device) => { void device.cancelConnection().catch(() => undefined); });
    };
  }

  async connect(peripheralId: string, attempt?: DiagnosticAttempt): Promise<void> {
    await this.disconnect();
    this.#diagnosticAttempt = attempt;
    const operation = ++this.#operation;
    const result = this.#connectQueue.catch(() => undefined).then(() => this.#connect(peripheralId, operation));
    this.#connectQueue = result.then(() => undefined, () => undefined);
    await result;
  }

  async resolveAndConnect(desktopId: string, attempt?: DiagnosticAttempt): Promise<DiscoveredDesktop> {
    await this.disconnect();
    this.#diagnosticAttempt = attempt;
    const operation = ++this.#operation;
    this.#recordStage('resolution', 'started', operation);
    return new Promise<DiscoveredDesktop>((resolve, reject) => {
      let active = true;
      let claimedDeviceId: string | null = null;
      let cancellation: Promise<void> | null = null;
      const waiting = new Map<string, Device>();
      const succeed = (desktop: DiscoveredDesktop) => {
        if (!active) return;
        this.#recordStage('resolution', 'succeeded', operation);
        active = false;
        waiting.clear();
        clearTimeout(timer);
        this.#managerOrCreate().stopDeviceScan();
        this.#scanKeys.clear();
        if (this.#resolutionCancel === cancel) this.#resolutionCancel = null;
        resolve(desktop);
      };
      const cancel = (error: Error, outcome: 'failed' | 'timed_out' = 'failed'): Promise<void> => {
        if (!active) return cancellation ?? Promise.resolve();
        this.#recordStage('resolution', outcome, operation);
        active = false;
        waiting.clear();
        clearTimeout(timer);
        this.#managerOrCreate().stopDeviceScan();
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
      const timer = setTimeout(() => { void cancel(new Error('Saved PC discovery timed out.'), 'timed_out'); }, this.nativeTimeoutMs);
      const onAdvertisement = (error: Error | null, device: Device | null) => {
        if (!active || operation !== this.#operation || claimedDeviceId !== null) return;
        if (error) { void cancel(new Error('Saved PC discovery failed.')); return; }
        if (!device || this.#scanDevices.has(device.id) || this.#scanKeys.has(this.#scanKey(device))) return;
        if (this.#scanDevices.size >= 4) {
          if (waiting.size < 32) waiting.set(device.id, device);
          return;
        }
        waiting.delete(device.id);
        this.#scanDevices.set(device.id, device);
        this.#scanKeys.add(this.#scanKey(device));
        const task = this.#readStatus(device, (desktop) => {
          if (!active || operation !== this.#operation) return false;
          try { this.diagnostics?.peerObserved?.(desktop.desktopId, desktop.responseTransport === 'read-v1', attempt, desktop.desktopId === desktopId); } catch { /* Diagnostic isolation. */ }
          this.#recordStage('selected_match', desktop.desktopId === desktopId ? 'succeeded' : 'not_matched', operation);
          if (desktop.desktopId !== desktopId || claimedDeviceId !== null) return false;
          claimedDeviceId = device.id;
          waiting.clear();
          return true;
        }).then(async (desktop) => {
          if (!active || operation !== this.#operation || desktop?.desktopId !== desktopId || claimedDeviceId !== device.id) return;
          this.#scanDevices.delete(device.id);
          this.#managerOrCreate().stopDeviceScan();
          const otherProbes = [...this.#scanDevices.values()];
          this.#scanDevices.clear();
          otherProbes.forEach((probe) => { void probe.cancelConnection().catch(() => undefined); });
          let connected = this.#requireDevice();
          if (this.platform === 'android') {
            connected = await this.#requestHighPriority(connected);
            if (!active || operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
            this.#device = connected;
            connected = await this.#stage('mtu', () => this.#bounded(connected!.requestMTU(517)), operation);
            if (!active || operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
            this.#device = connected;
          }
          connected = await this.#stage('services', () => this.#bounded(connected!.discoverAllServicesAndCharacteristics()), operation);
          if (!active || operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
          this.#device = connected;
          this.#readReplies = desktop.responseTransport === 'read-v1';
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
            const next = waiting.values().next().value;
            if (next) onAdvertisement(null, next);
          }
        });
        this.#scanTasks.add(task);
        void task.finally(() => this.#scanTasks.delete(task));
      };
      try {
        this.#managerOrCreate().startDeviceScan([BLE_UUIDS.service], null, onAdvertisement);
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
      connected = await this.#stage('connect', () => {
        const nativeConnect = this.#managerOrCreate().connectToDevice(peripheralId);
        void nativeConnect.then((device) => {
          if (connectCancelled || operation !== this.#operation) void device.cancelConnection().catch(() => undefined);
        }, () => undefined);
        return this.#bounded(nativeConnect);
      }, operation);
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      this.#device = connected;
      if (this.platform === 'android') {
        connected = await this.#requestHighPriority(connected);
        if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
        this.#device = connected;
        connected = await this.#stage('mtu', () => this.#bounded(connected!.requestMTU(517)), operation);
        if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
        this.#device = connected;
      }
      connected = await this.#stage('services', () => this.#bounded(connected!.discoverAllServicesAndCharacteristics()), operation);
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      this.#device = connected;
      const statusValue = await this.#bounded(connected.readCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.status));
      if (operation !== this.#operation) throw new Error('Bluetooth connection was cancelled.');
      const status = statusValue.value ? parseStatus(new TextDecoder().decode(toByteArray(statusValue.value))) : null;
      if (!status) throw new Error('Bluetooth discovery status is invalid.');
      this.#readReplies = status.responseTransport === 'read-v1';
      this.#writePoisoned = false;
    } catch (error) {
      connectCancelled = true;
      if (connected) await this.#bounded(connected.cancelConnection(), this.#cancellationTimeout()).catch(() => undefined);
      else void this.#managerOrCreate().cancelDeviceConnection(peripheralId).catch(() => undefined);
      if (operation === this.#operation) this.#device = null;
      throw error;
    } finally {
      if (this.#connectingPeripheralId === peripheralId) this.#connectingPeripheralId = null;
    }
  }

  async disconnect(): Promise<void> {
    this.#operation += 1;
    this.#responsePoller?.stop();
    this.#responsePoller = null;
    this.#readReplies = false;
    const cancelResolution = this.#resolutionCancel;
    if (cancelResolution) await cancelResolution(new Error('Bluetooth operation was cancelled.'));
    this.#cancelNativeOperations();
    await this.cancelPendingWrites();
    const connectingPeripheralId = this.#connectingPeripheralId;
    this.#connectingPeripheralId = null;
    const manager = this.#manager;
    if (connectingPeripheralId && manager) void manager.cancelDeviceConnection(connectingPeripheralId).catch(() => undefined);
    manager?.stopDeviceScan();
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

  async verifyConnection(desktopId: string): Promise<boolean> {
    let active = true;
    try {
      const device = this.#requireDevice();
      return await this.#bounded((async () => {
        if (!await device.isConnected()) return false;
        if (!active) return false;
        const characteristic = await device.readCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.status);
        if (!active || !characteristic.value) return false;
        const raw = new TextDecoder().decode(toByteArray(characteristic.value));
        return parseStatus(raw)?.desktopId === desktopId;
      })(), Math.min(4_000, this.nativeTimeoutMs));
    } catch {
      return false;
    } finally {
      active = false;
    }
  }

  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe {
    if (this.#readReplies) {
      if (this.#responsePoller || this.#writePoisoned) throw new Error('Reconnect before starting response reads again.');
      const device = this.#requireDevice();
      const operation = this.#operation;
      const transaction = `switchify-read-${operation}`;
      const poller = new ReadResponsePoller(
        async () => (await device.readCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.response, transaction)).value,
        async () => { await this.#managerOrCreate().cancelTransaction(transaction); },
        (frame) => { if (operation === this.#operation) onFrame(frame); },
        (error) => { if (operation === this.#operation) { this.#writePoisoned = true; onError(error); } },
        this.nativeTimeoutMs,
      );
      this.#responsePoller = poller;
      return () => { poller.stop(); if (this.#responsePoller === poller) this.#writePoisoned = true; };
    }
    const operation = this.#operation;
    let active = true;
    let failed = false;
    const recordFailure = () => {
      if (active && !failed) this.#recordStage('notifications', 'failed', operation);
      failed = true;
    };
    this.#recordStage('notifications', 'started', operation);
    try {
      const subscription: Subscription = this.#requireDevice().monitorCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.transmit, (error, characteristic) => {
        if (error) { recordFailure(); onError(error); }
        else if (characteristic?.value) onFrame(characteristic.value);
      });
      if (!failed) this.#recordStage('notifications', 'succeeded', operation);
      return () => { active = false; subscription.remove(); };
    } catch (error) {
      recordFailure();
      throw error;
    }
  }

  async notificationsReady(): Promise<void> {
    if (this.#readReplies) {
      if (!this.#responsePoller) throw new Error('Bluetooth response reader has not started.');
      await this.#stage('response_read_ready', () => this.#responsePoller!.ready);
      return;
    }
    if (this.platform !== 'android') return;
    await this.#stage('notification_ready', async () => {
      const descriptor = await this.#bounded(this.#requireDevice().readDescriptorForService(
        BLE_UUIDS.service,
        BLE_UUIDS.transmit,
        BLE_DESCRIPTORS.clientCharacteristicConfiguration,
      ));
      if (descriptor.value !== 'AQA=') throw new Error('Bluetooth notifications could not be enabled.');
    });
  }

  subscribeDisconnect(onDisconnect: () => void): Unsubscribe {
    const device = this.#requireDevice();
    const subscription = this.#managerOrCreate().onDeviceDisconnected(device.id, () => onDisconnect());
    return () => subscription.remove();
  }

  async #readStatus(device: Device, retain = (_desktop: DiscoveredDesktop) => false): Promise<DiscoveredDesktop | null> {
    const operation = this.#operation;
    let connectedHere = false;
    let target = device;
    let probeFinished = false;
    try {
      connectedHere = !(await this.#bounded(device.isConnected()));
      if (connectedHere) {
        target = await this.#stage('probe_connect', () => {
          const nativeConnect = device.connect();
          void nativeConnect.then((connected) => {
            if (probeFinished || operation !== this.#operation) void connected.cancelConnection().catch(() => undefined);
          }, () => undefined);
          return this.#bounded(nativeConnect);
        }, operation);
      }
      await this.#stage('probe_services', () => this.#bounded(target.discoverAllServicesAndCharacteristics()), operation);
      const characteristic = await this.#stage('status_read', () => this.#bounded(target.readCharacteristicForService(BLE_UUIDS.service, BLE_UUIDS.status)), operation);
      this.#recordStage('status_parse', 'started', operation);
      let status;
      try {
        status = characteristic.value ? parseStatus(new TextDecoder().decode(toByteArray(characteristic.value))) : null;
      } catch (error) {
        this.#recordStage('status_parse', 'failed', operation);
        throw error;
      }
      this.#recordStage('status_parse', status ? 'succeeded' : 'failed', operation);
      const desktop = status ? {
        ...status,
        displayName: desktopDisplayName(status, { name: device.name, localName: device.localName }, this.platform),
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

  #managerOrCreate(): BleManager {
    this.#manager ??= this.managerFactory();
    return this.#manager;
  }

  #recordStage(stage: ConnectionStage, outcome: ConnectionStageOutcome, operation: number): void {
    if (operation !== this.#operation) return;
    // Diagnostics must never change Bluetooth control flow, even if a UI listener throws.
    try { this.diagnostics?.addConnectionStage(stage, outcome, this.#diagnosticAttempt); } catch { /* best effort */ }
  }

  async #stage<T>(stage: ConnectionStage, action: () => Promise<T>, operation = this.#operation): Promise<T> {
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

  #settledManagerState(manager: BleManager, initial: State): Promise<State> {
    if (initial !== 'Unknown' && initial !== 'Resetting') return Promise.resolve(initial);
    return new Promise<State>((resolve) => {
      let settled = false;
      let latest: State = initial;
      let subscription: Subscription | null = null;
      const finish = (state: State) => {
        if (settled) return;
        settled = true;
        subscription?.remove();
        this.#nativeCancels.delete(cancel);
        resolve(state);
      };
      const cancel = () => finish(latest);
      this.#nativeCancels.add(cancel);
      try {
        subscription = manager.onStateChange((state) => {
          latest = state;
          if (state !== 'Unknown' && state !== 'Resetting') finish(state);
        }, true);
        if (settled) subscription.remove();
      } catch {
        finish(latest);
      }
    });
  }

  async #requestHighPriority(device: Device): Promise<Device> {
    try {
      return await this.#stage('priority', () => this.#bounded(device.requestConnectionPriority(ConnectionPriority.High)));
    } catch {
      return device;
    }
  }

  #scanKey(device: Device): string {
    return `id:${device.id}`;
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
      void this.#managerOrCreate().cancelTransaction(transactionId).then(() => {
        completed = true;
        clearTimeout(timer);
        resolve();
      }, () => { clearTimeout(timer); resolve(); });
    });
    if (!completed) this.#writePoisoned = true;
  }

  #cancellationTimeout(): number { return Math.min(1_000, this.nativeTimeoutMs); }
}
