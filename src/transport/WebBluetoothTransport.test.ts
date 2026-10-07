import { fromByteArray, toByteArray } from 'base64-js';

import { BLE_UUIDS } from '@/domain/protocol/constants';
import { BluetoothDeviceSelectionCancelledError } from './BleTransport';
import {
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
  writeGate: Promise<void> | null = null;
  characteristics: Record<string, FakeCharacteristic>;
  constructor(readonly id: string, public status: string, readonly name: string | null = 'Office PC', withResponse = false) {
    super();
    const uuids: string[] = [BLE_UUIDS.receive, BLE_UUIDS.transmit, BLE_UUIDS.status, ...(withResponse ? [BLE_UUIDS.response] : [])];
    this.characteristics = Object.fromEntries(uuids.map((uuid) => [uuid, new FakeCharacteristic(this, uuid)]));
  }
  get gatt(): WebBluetoothServer { return this; }
  async connect(): Promise<WebBluetoothServer> { this.connects += 1; this.connected = true; return this; }
  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.dispatchEvent(new Event('gattserverdisconnected'));
  }
  async getPrimaryService(uuid: string): Promise<WebBluetoothService> {
    if (uuid !== BLE_UUIDS.service) throw new Error('missing service');
    return {
      getCharacteristic: async (characteristic: string) => {
        const found = this.characteristics[characteristic];
        if (!found) throw new Error('missing characteristic');
        return found;
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

const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };

describe('WebBluetoothTransport', () => {
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

  it('requires a reconnect after cancelling a write already in flight', async () => {
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
    await transport.cancelPendingWrites();
    await expect(queued).rejects.toThrow('cancelled');
    release();
    await inFlight;
    await expect(transport.writeFrame('Yw==')).rejects.toThrow('until reconnect');
  });
});
