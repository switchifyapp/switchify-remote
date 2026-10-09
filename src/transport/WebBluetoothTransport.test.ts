import { fromByteArray, toByteArray } from 'base64-js';

import { BLE_UUIDS } from '@/domain/protocol/constants';
import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import { BluetoothDeviceSelectionCancelledError, BluetoothPickerBlockedError } from './BleTransport';
import {
  REMEMBERED_DEVICE_BUDGET_MS,
  WEB_MAX_WRITE_VALUE_BYTES,
  WebBluetoothTransport,
  type WebBluetooth,
  type WebBluetoothCharacteristic,
  type WebBluetoothDevice,
  type WebBluetoothServer,
  type WebBluetoothService,
} from './WebBluetoothTransport';

const encoder = new TextEncoder();
const view = (text: string) => new DataView(encoder.encode(text).buffer);
const status = (desktopId: string, extra: Record<string, unknown> = {}) => JSON.stringify({ protocolVersion: 1, desktopId, displayName: 'Office PC', platform: 'windows', ...extra });

class FakeCharacteristic extends EventTarget implements WebBluetoothCharacteristic {
  value: DataView | null = null;
  writes: Uint8Array[] = [];
  reads: (() => DataView)[] = [];
  notifying = false;
  constructor(private readonly peripheral: FakePeripheral, readonly uuid: string) { super(); }
  async readValue(): Promise<DataView> {
    return this.peripheral.operation(() => {
      if (this.uuid === BLE_UUIDS.status) return view(this.peripheral.status);
      return this.reads.shift()?.() ?? new DataView(new ArrayBuffer(0));
    });
  }
  async writeValueWithResponse(value: BufferSource): Promise<void> {
    await this.peripheral.operation(() => { this.writes.push(new Uint8Array(value as ArrayBuffer)); }, this.peripheral.writeGate);
  }
  async startNotifications(): Promise<FakeCharacteristic> { return this.peripheral.operation(() => { this.notifying = true; return this; }); }
  async stopNotifications(): Promise<FakeCharacteristic> { this.notifying = false; return this; }
  notify(text: string): void {
    this.value = view(text);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FakePeripheral extends EventTarget implements WebBluetoothDevice, WebBluetoothServer {
  connected = false;
  busy = false;
  overlapping = false;
  connects = 0;
  discovered: string[] = [];
  writeGate: Promise<void> | null = null;
  connectGate: Promise<void> | null = null;
  characteristics: Record<string, FakeCharacteristic>;
  constructor(readonly id: string, public status: string, readonly name: string | null = 'Office PC', withResponse = false) {
    super();
    const uuids: string[] = [BLE_UUIDS.receive, BLE_UUIDS.transmit, BLE_UUIDS.status, ...(withResponse ? [BLE_UUIDS.response] : [])];
    this.characteristics = Object.fromEntries(uuids.map((uuid) => [uuid, new FakeCharacteristic(this, uuid)]));
  }
  get gatt(): WebBluetoothServer { return this; }
  failConnect = false;
  async connect(): Promise<WebBluetoothServer> {
    this.connects += 1;
    await this.connectGate;
    if (this.failConnect) throw Object.assign(new Error('Connection failed.'), { name: 'NetworkError' });
    this.connected = true;
    return this;
  }
  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.dispatchEvent(new Event('gattserverdisconnected'));
  }
  async getPrimaryService(uuid: string): Promise<WebBluetoothService> {
    if (uuid !== BLE_UUIDS.service) throw new Error('missing service');
    return {
      getCharacteristic: async (characteristic: string) => {
        this.discovered.push(characteristic);
        if (this.busy) throw new Error('GATT operation already in progress');
        return this.operation(() => {
          const found = this.characteristics[characteristic];
          if (!found) throw new Error('missing characteristic');
          return found;
        });
      },
    };
  }
  async operation<T>(action: () => T, gate: Promise<void> | null = null): Promise<T> {
    if (this.busy) this.overlapping = true;
    this.busy = true;
    try {
      await Promise.resolve();
      await gate;
      return action();
    } finally {
      this.busy = false;
    }
  }
}

class FakeBluetooth implements WebBluetooth {
  chooser: (() => Promise<WebBluetoothDevice>) | null = null;
  requests = 0;
  remembered: WebBluetoothDevice[] = [];
  available = true;
  async getAvailability(): Promise<boolean> { return this.available; }
  async getDevices(): Promise<WebBluetoothDevice[]> { return this.remembered; }
  async requestDevice(): Promise<WebBluetoothDevice> {
    this.requests += 1;
    if (!this.chooser) throw Object.assign(new Error('User cancelled the requestDevice() chooser.'), { name: 'NotFoundError' });
    return this.chooser();
  }
}

const flush = async () => { for (let index = 0; index < 100; index += 1) await Promise.resolve(); };

describe('WebBluetoothTransport', () => {
  it.each(['connect', 'resolve'] as const)('does not restart %s when disconnected during initial cleanup', async (method) => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.remembered = [peripheral];
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const connecting = method === 'connect' ? transport.connect('web-1') : transport.resolveAndConnect('desk-1');
    const rejected = expect(connecting).rejects.toThrow('cancelled');
    await transport.disconnect();
    await rejected;
    expect(bluetooth.requests).toBe(0);
    expect(peripheral.connects).toBe(0);
  });

  it('lets only the replacement attempt proceed after initial cleanup', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const first = transport.resolveAndConnect('old');
    const rejected = expect(first).rejects.toThrow('cancelled');
    await expect(transport.resolveAndConnect('desk-1')).resolves.toMatchObject({ desktopId: 'desk-1' });
    await rejected;
    expect(bluetooth.requests).toBe(1);
    expect(peripheral.connected).toBe(true);
    await transport.disconnect();
  });

  it('hands a selected probe to pairing without reconnecting or rediscovering its service', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    const primary = jest.spyOn(peripheral, 'getPrimaryService');
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const stop = transport.scan(jest.fn(), jest.fn());
    await flush();
    expect(transport.retainDiscoveredConnection('desk-1')).toBe(true);
    stop();
    expect(peripheral.connected).toBe(true);
    await expect(transport.resolveAndConnect('desk-1')).resolves.toMatchObject({ desktopId: 'desk-1' });
    expect(peripheral.connects).toBe(1);
    expect(primary).toHaveBeenCalledTimes(1);
    await transport.disconnect();
    expect(peripheral.connected).toBe(false);
  });

  it.each(['cancel', 'wrong-id', 'lost-link'] as const)('does not retain an unsafe probe after %s', async (reason) => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const stop = transport.scan(jest.fn(), jest.fn());
    await flush();
    if (reason === 'lost-link') peripheral.disconnect();
    expect(transport.retainDiscoveredConnection(reason === 'wrong-id' ? 'other' : 'desk-1')).toBe(reason === 'cancel');
    stop();
    await transport.disconnect();
    expect(peripheral.connected).toBe(false);
    expect(transport.retainDiscoveredConnection('desk-1')).toBe(false);
  });

  it('rereads identity on a retained connection and rejects a changed desktop', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const stop = transport.scan(jest.fn(), jest.fn());
    await flush();
    transport.retainDiscoveredConnection('desk-1');
    stop();
    peripheral.status = status('other');
    await expect(transport.resolveAndConnect('desk-1')).rejects.toThrow('different PC');
    expect(peripheral.connected).toBe(false);
  });

  it('does not publish a session when disconnected as discovery finishes', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const diagnostics = { addConnectionStage: jest.fn() };
    const transport = new WebBluetoothTransport(() => bluetooth, 100, diagnostics);
    diagnostics.addConnectionStage.mockImplementation((stage, outcome) => {
      if (stage === 'services' && outcome === 'succeeded') void transport.disconnect();
    });
    await expect(transport.resolveAndConnect('desk-1')).rejects.toThrow('cancelled');
    expect(() => transport.maxWriteValueBytes()).toThrow('No PC is connected.');
    expect(peripheral.connected).toBe(false);
  });

  it('discovers sequentially and never requests read-response on a notification PC', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await transport.resolveAndConnect('desk-1');
    expect(peripheral.discovered).toEqual([BLE_UUIDS.status, BLE_UUIDS.receive, BLE_UUIDS.transmit]);
    expect(peripheral.overlapping).toBe(false);
    await transport.disconnect();
  });

  it('fails safely when a read-v1 PC omits its required response characteristic', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1', { responseTransport: 'read-v1' }));
    bluetooth.chooser = async () => peripheral;
    const diagnostics = new DiagnosticLog();
    const transport = new WebBluetoothTransport(() => bluetooth, 100, diagnostics);
    await expect(transport.resolveAndConnect('desk-1')).rejects.toThrow();
    expect(diagnostics.export()).toContain('ble_response_characteristic_failed');
    expect(diagnostics.export()).not.toContain('missing characteristic');
    expect(peripheral.connected).toBe(false);
  });

  it.each(['disconnect', 'timeout'] as const)('does not continue discovery after %s and a late service result', async (reason) => {
    jest.useFakeTimers();
    try {
      const bluetooth = new FakeBluetooth();
      const peripheral = new FakePeripheral('web-1', status('desk-1'));
      const service = await peripheral.getPrimaryService(BLE_UUIDS.service);
      let release!: (service: WebBluetoothService) => void;
      peripheral.getPrimaryService = () => new Promise((resolve) => { release = resolve; });
      bluetooth.chooser = async () => peripheral;
      const transport = new WebBluetoothTransport(() => bluetooth, 100);
      const connecting = transport.resolveAndConnect('desk-1');
      const rejected = expect(connecting).rejects.toThrow();
      await flush();
      if (reason === 'disconnect') await transport.disconnect();
      else await jest.advanceTimersByTimeAsync(100);
      await rejected;
      release(service);
      await flush();
      expect(peripheral.discovered).toEqual([]);
      expect(peripheral.connected).toBe(false);
    } finally { jest.useRealTimers(); }
  });

  it.each(['resolve', 'reject'] as const)('does not let a timed-out probe block the chosen PC or its queue after late %s', async (outcome) => {
    jest.useFakeTimers();
    try {
      const bluetooth = new FakeBluetooth();
      const stale = new FakePeripheral('stale', status('other'));
      let resolveRead!: (value: DataView) => void;
      let rejectRead!: (error: Error) => void;
      stale.characteristics[BLE_UUIDS.status]!.readValue = () => new Promise((resolve, reject) => {
        resolveRead = resolve; rejectRead = reject;
      });
      const chosen = new FakePeripheral('chosen', status('wanted'));
      bluetooth.remembered = [stale];
      bluetooth.chooser = async () => chosen;
      const transport = new WebBluetoothTransport(() => bluetooth);
      const connecting = transport.resolveAndConnect('wanted');
      await jest.advanceTimersByTimeAsync(REMEMBERED_DEVICE_BUDGET_MS + 10);
      await expect(connecting).resolves.toMatchObject({ desktopId: 'wanted' });
      expect(stale.connected).toBe(false);
      expect(chosen.connected).toBe(true);
      expect(bluetooth.requests).toBe(1);
      if (outcome === 'resolve') resolveRead(view(status('other')));
      else rejectRead(new Error('late native failure'));
      await flush();
      await transport.writeFrame('YQ==');
      expect(await transport.verifyConnection('wanted')).toBe(true);
      expect(chosen.overlapping).toBe(false);
      await transport.disconnect();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not open the picker or revive a connection after disconnect during a probe read', async () => {
    const bluetooth = new FakeBluetooth();
    const stale = new FakePeripheral('stale', status('wanted'));
    let resolveRead!: (value: DataView) => void;
    stale.characteristics[BLE_UUIDS.status]!.readValue = () => new Promise((resolve) => { resolveRead = resolve; });
    bluetooth.remembered = [stale];
    const transport = new WebBluetoothTransport(() => bluetooth);
    const connecting = transport.resolveAndConnect('wanted');
    const rejected = expect(connecting).rejects.toThrow('cancelled');
    await flush();
    await transport.disconnect();
    resolveRead(view(status('wanted')));
    await rejected;
    expect(stale.connected).toBe(false);
    expect(bluetooth.requests).toBe(0);
    expect(await transport.verifyConnection('wanted')).toBe(false);
  });

  it('reports when the browser has no Web Bluetooth', async () => {
    expect(await new WebBluetoothTransport(() => null).availability()).toBe('unsupported');
    const bluetooth = new FakeBluetooth();
    bluetooth.available = false;
    expect(await new WebBluetoothTransport(() => bluetooth).availability()).toBe('poweredOff');
  });

  it('turns a device chosen in the browser picker into a discovered PC', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const found = jest.fn();
    transport.scan(found, jest.fn());
    await flush();
    expect(found).toHaveBeenCalledWith({ desktopId: 'desk-1', displayName: 'Office PC', platform: 'windows', peripheralId: 'web-1', rssi: null });
  });

  it('reports a closed picker as a cancelled selection, not a failure', async () => {
    const bluetooth = new FakeBluetooth();
    const transport = new WebBluetoothTransport(() => bluetooth);
    const onError = jest.fn();
    transport.scan(jest.fn(), onError);
    await flush();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(BluetoothDeviceSelectionCancelledError);
    await expect(transport.resolveAndConnect('desk-1')).rejects.toBeInstanceOf(BluetoothDeviceSelectionCancelledError);
  });

  it('reconnects to a chosen PC without asking again and closes the discovery probe on stop', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const stop = transport.scan(jest.fn(), jest.fn());
    await flush();
    stop();
    expect(peripheral.connected).toBe(false);
    await expect(transport.resolveAndConnect('desk-1')).resolves.toMatchObject({ desktopId: 'desk-1', peripheralId: 'web-1' });
    expect(bluetooth.requests).toBe(1);
    expect(peripheral.connected).toBe(true);
    expect(transport.maxWriteValueBytes()).toBe(WEB_MAX_WRITE_VALUE_BYTES);
  });

  it('finds a saved PC among devices the browser remembers', async () => {
    const bluetooth = new FakeBluetooth();
    const other = new FakePeripheral('web-0', status('desk-0'));
    const saved = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.remembered = [other, saved];
    const transport = new WebBluetoothTransport(() => bluetooth);
    await expect(transport.resolveAndConnect('desk-1')).resolves.toMatchObject({ peripheralId: 'web-1' });
    expect(bluetooth.requests).toBe(0);
    expect(other.connected).toBe(false);
  });

  it('refuses a different PC chosen for a saved one', async () => {
    const bluetooth = new FakeBluetooth();
    const wrong = new FakePeripheral('web-2', status('desk-2'));
    bluetooth.chooser = async () => wrong;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await expect(transport.resolveAndConnect('desk-1')).rejects.toThrow('different PC');
    expect(wrong.connected).toBe(false);
    expect(() => transport.maxWriteValueBytes()).toThrow('No PC is connected.');
  });

  it('rejects an invalid status', async () => {
    const bluetooth = new FakeBluetooth();
    bluetooth.chooser = async () => new FakePeripheral('web-1', '{"protocolVersion":2}');
    await expect(new WebBluetoothTransport(() => bluetooth).resolveAndConnect('desk-1')).rejects.toThrow('status is invalid');
  });

  it('runs GATT operations one at a time and bounds frame size', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await transport.resolveAndConnect('desk-1');
    const frames = ['YQ==', 'Yg==', 'Yw=='];
    await Promise.all([...frames.map((frame) => transport.writeFrame(frame)), transport.verifyConnection('desk-1')]);
    expect(peripheral.overlapping).toBe(false);
    expect(peripheral.characteristics[BLE_UUIDS.receive]!.writes.map((bytes) => fromByteArray(bytes))).toEqual(frames);
    await expect(transport.writeFrame(fromByteArray(new Uint8Array(WEB_MAX_WRITE_VALUE_BYTES + 1)))).rejects.toThrow('too large');
  });

  it('delivers notifications as base64 frames once they are enabled', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await transport.resolveAndConnect('desk-1');
    const frames: string[] = [];
    const unsubscribe = transport.subscribe((frame) => frames.push(frame), jest.fn());
    await transport.notificationsReady();
    peripheral.characteristics[BLE_UUIDS.transmit]!.notify('{"ok":true}');
    expect(frames.map((frame) => new TextDecoder().decode(toByteArray(frame)))).toEqual(['{"ok":true}']);
    unsubscribe();
    peripheral.characteristics[BLE_UUIDS.transmit]!.notify('{"late":true}');
    expect(frames).toHaveLength(1);
  });

  it('polls the response characteristic for read-v1 PCs', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1', { responseTransport: 'read-v1' }), 'Office PC', true);
    peripheral.characteristics[BLE_UUIDS.response]!.reads.push(() => view('{"reply":1}'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await transport.resolveAndConnect('desk-1');
    const frames: string[] = [];
    const unsubscribe = transport.subscribe((frame) => frames.push(frame), jest.fn());
    await transport.notificationsReady();
    await flush();
    expect(frames.map((frame) => new TextDecoder().decode(toByteArray(frame)))).toEqual(['{"reply":1}']);
    unsubscribe();
    await transport.disconnect();
  });

  it('reports disconnects only for the current session', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await transport.resolveAndConnect('desk-1');
    const onDisconnect = jest.fn();
    transport.subscribeDisconnect(onDisconnect);
    peripheral.disconnect();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await transport.disconnect();
    expect(await transport.verifyConnection('desk-1')).toBe(false);
  });

  it('waits for an in-flight write when cancelling so cleanup commands still reach the PC', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await transport.resolveAndConnect('desk-1');
    let release!: () => void;
    peripheral.writeGate = new Promise((resolve) => { release = resolve; });
    const inFlight = transport.writeFrame('YQ==');
    const queued = transport.writeFrame('Yg==');
    await flush();
    const cancelling = transport.cancelPendingWrites();
    await expect(queued).rejects.toThrow('cancelled');
    release();
    await inFlight;
    await cancelling;
    peripheral.writeGate = null;
    await transport.writeFrame('Yw==');
    expect(peripheral.characteristics[BLE_UUIDS.receive]!.writes.map((bytes) => fromByteArray(bytes))).toEqual(['YQ==', 'Yw==']);
  });

  it('requires a reconnect only when an in-flight write never settles, and a new connection is not blocked by it', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth, 30);
    await transport.resolveAndConnect('desk-1');
    peripheral.writeGate = new Promise<void>(() => undefined);
    const stuck = transport.writeFrame('YQ==');
    void stuck.catch(() => undefined);
    await flush();
    await transport.cancelPendingWrites();
    await expect(transport.writeFrame('Yg==')).rejects.toThrow('until reconnect');
    peripheral.writeGate = null;
    peripheral.busy = false;
    await transport.resolveAndConnect('desk-1');
    await expect(transport.writeFrame('Yw==')).resolves.toBeUndefined();
  });

  it('reports a device with an invalid status instead of waiting forever', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', 'not json');
    bluetooth.chooser = async () => peripheral;
    const onError = jest.fn();
    new WebBluetoothTransport(() => bluetooth).scan(jest.fn(), onError);
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bluetooth discovery failed.' }));
    expect(peripheral.connected).toBe(false);
  });

  it('closes a discovery connection that completes after the search stopped', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    let release!: () => void;
    peripheral.connectGate = new Promise((resolve) => { release = resolve; });
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());
    await flush();
    stop();
    release();
    await flush();
    expect(peripheral.connected).toBe(false);
    expect(found).not.toHaveBeenCalled();
  });

  it('stops checking unreachable remembered devices in time to open the picker', async () => {
    jest.useFakeTimers();
    try {
      const bluetooth = new FakeBluetooth();
      const unreachable = new FakePeripheral('web-0', status('desk-0'));
      unreachable.connectGate = new Promise<void>(() => undefined);
      const chosen = new FakePeripheral('web-1', status('desk-1'));
      bluetooth.remembered = [unreachable];
      bluetooth.chooser = async () => chosen;
      const transport = new WebBluetoothTransport(() => bluetooth);
      const connecting = transport.resolveAndConnect('desk-1');
      await jest.advanceTimersByTimeAsync(REMEMBERED_DEVICE_BUDGET_MS + 10);
      await expect(connecting).resolves.toMatchObject({ desktopId: 'desk-1' });
      expect(bluetooth.requests).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the connection when a timed-out check of the same PC finishes after it is chosen', async () => {
    jest.useFakeTimers();
    try {
      const bluetooth = new FakeBluetooth();
      const slow = new FakePeripheral('web-1', status('desk-1'));
      let release!: () => void;
      slow.connectGate = new Promise((resolve) => { release = resolve; });
      bluetooth.remembered = [slow];
      bluetooth.chooser = async () => slow;
      const transport = new WebBluetoothTransport(() => bluetooth);
      const connecting = transport.resolveAndConnect('desk-1');
      await jest.advanceTimersByTimeAsync(REMEMBERED_DEVICE_BUDGET_MS + 10);
      release();
      await jest.advanceTimersByTimeAsync(10);
      await expect(connecting).resolves.toMatchObject({ desktopId: 'desk-1' });
      expect(slow.connected).toBe(true);
      expect(transport.maxWriteValueBytes()).toBe(WEB_MAX_WRITE_VALUE_BYTES);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a picker the browser refused to open as blocked, not cancelled', async () => {
    const bluetooth = new FakeBluetooth();
    bluetooth.chooser = async () => { throw Object.assign(new Error('Must be handling a user gesture.'), { name: 'SecurityError' }); };
    await expect(new WebBluetoothTransport(() => bluetooth).resolveAndConnect('desk-1')).rejects.toBeInstanceOf(BluetoothPickerBlockedError);
  });

  it('treats a missing service after the picker as a connection failure, not a closed picker', async () => {
    const bluetooth = new FakeBluetooth();
    const peripheral = new FakePeripheral('web-1', status('desk-1'));
    peripheral.getPrimaryService = async () => { throw Object.assign(new Error('No Services matching UUID found in Device.'), { name: 'NotFoundError' }); };
    bluetooth.chooser = async () => peripheral;
    const transport = new WebBluetoothTransport(() => bluetooth);
    const failure = await transport.resolveAndConnect('desk-1').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(BluetoothDeviceSelectionCancelledError);
    const onError = jest.fn();
    transport.scan(jest.fn(), onError);
    await flush();
    expect(onError.mock.calls[0]?.[0]).not.toBeInstanceOf(BluetoothDeviceSelectionCancelledError);
  });

  it('forgets a cached device that fails so the next attempt finds the PC again', async () => {
    const bluetooth = new FakeBluetooth();
    const previous = new FakePeripheral('web-old', status('desk-1'));
    const replacement = new FakePeripheral('web-new', status('desk-1'));
    bluetooth.chooser = async () => previous;
    const transport = new WebBluetoothTransport(() => bluetooth);
    await transport.resolveAndConnect('desk-1');
    await transport.disconnect();
    previous.failConnect = true;
    bluetooth.chooser = async () => replacement;
    await expect(transport.resolveAndConnect('desk-1')).rejects.toThrow();
    expect(bluetooth.requests).toBe(1);
    await expect(transport.resolveAndConnect('desk-1')).resolves.toMatchObject({ desktopId: 'desk-1', peripheralId: 'web-new' });
    expect(bluetooth.requests).toBe(2);
  });
});
