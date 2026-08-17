import { fromByteArray } from 'base64-js';
import type { BleManager, Device } from 'react-native-ble-plx';
import { ReactNativeBleTransport } from './ReactNativeBleTransport';

function device(overrides: Partial<Device> = {}): Device {
  const base: Record<string, unknown> = {
    id: 'ble-1', mtu: 185, rssi: -42,
    isConnected: jest.fn(async () => true), cancelConnection: jest.fn(async () => null as unknown as Device),
    requestMTU: jest.fn(async () => ({ ...base, mtu: 517 })),
    discoverAllServicesAndCharacteristics: jest.fn(async () => base),
    connect: jest.fn(async () => base),
    readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode('{"protocolVersion":1,"desktopId":"pc-1","displayName":"Desk","platform":"windows"}')) })),
    writeCharacteristicWithResponseForService: jest.fn(async () => ({})),
    monitorCharacteristicForService: jest.fn(() => ({ remove: jest.fn() })),
    ...overrides,
  };
  return base as unknown as Device;
}

function manager(overrides: Record<string, unknown> = {}): BleManager {
  return {
    state: jest.fn(async () => 'PoweredOn'), startDeviceScan: jest.fn(), stopDeviceScan: jest.fn(),
    connectToDevice: jest.fn(), cancelDeviceConnection: jest.fn(async () => null as unknown as Device), cancelTransaction: jest.fn(async () => undefined), onDeviceDisconnected: jest.fn(() => ({ remove: jest.fn() })), ...overrides,
  } as unknown as BleManager;
}

describe('ReactNativeBleTransport', () => {
  it('requests the Android MTU and exposes the ATT value limit', async () => {
    const discovered = device({ mtu: 517 });
    const connected = device({ requestMTU: jest.fn(async () => discovered) });
    const native = manager({ connectToDevice: jest.fn(async () => connected) });
    const transport = new ReactNativeBleTransport(native, 'android');
    await transport.connect('ble-1');
    expect(connected.requestMTU).toHaveBeenCalledWith(517);
    expect(transport.maxWriteValueBytes()).toBe(514);
  });

  it('cancels a partial native connection when discovery fails', async () => {
    const connected = device({ discoverAllServicesAndCharacteristics: jest.fn(async () => { throw new Error('discovery failed'); }) });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');
    await expect(transport.connect('ble-1')).rejects.toThrow('discovery failed');
    expect(connected.cancelConnection).toHaveBeenCalled();
  });

  it('serializes replacement connects so stale cleanup cannot cancel the winner', async () => {
    let resolveFirst!: (value: Device) => void;
    const firstDevice = device();
    const secondDevice = device();
    const connectToDevice = jest.fn()
      .mockImplementationOnce(() => new Promise<Device>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async () => secondDevice);
    const transport = new ReactNativeBleTransport(manager({ connectToDevice }), 'ios');
    const first = transport.connect('first');
    const firstRejected = expect(first).rejects.toThrow('cancelled');
    await waitFor(() => connectToDevice.mock.calls.length === 1);
    const second = transport.connect('second');
    expect(connectToDevice).toHaveBeenCalledTimes(1);
    resolveFirst(firstDevice);
    await firstRejected;
    await second;
    expect(firstDevice.cancelConnection).toHaveBeenCalled();
    expect(connectToDevice).toHaveBeenCalledTimes(2);
    expect(transport.maxWriteValueBytes()).toBe(182);
  });

  it('cancels a native connect that never settles and allows a replacement', async () => {
    const secondDevice = device();
    const connectToDevice = jest.fn()
      .mockImplementationOnce(() => new Promise<Device>(() => undefined))
      .mockImplementationOnce(async () => secondDevice);
    const native = manager({ connectToDevice });
    const transport = new ReactNativeBleTransport(native, 'ios');
    const first = transport.connect('stuck');
    await waitFor(() => connectToDevice.mock.calls.length === 1);
    const second = transport.connect('replacement');
    await expect(first).rejects.toThrow('cancelled');
    await second;
    expect(native.cancelDeviceConnection).toHaveBeenCalledWith('stuck');
    expect(connectToDevice).toHaveBeenCalledTimes(2);
  });

  it('bounds a native connection even without an explicit cancellation', async () => {
    const native = manager({ connectToDevice: jest.fn(() => new Promise<Device>(() => undefined)) });
    const transport = new ReactNativeBleTransport(native, 'ios', 1);
    await expect(transport.connect('stuck')).rejects.toThrow('timed out');
    expect(native.cancelDeviceConnection).toHaveBeenCalledWith('stuck');
  });

  it('cancels the native transaction before releasing a hung GATT write', async () => {
    const connected = device({ writeCharacteristicWithResponseForService: jest.fn(() => new Promise(() => undefined)) });
    const native = manager({ connectToDevice: jest.fn(async () => connected) });
    const transport = new ReactNativeBleTransport(native, 'ios');
    await transport.connect('ble-1');
    const write = transport.writeFrame('frame');
    await waitFor(() => (connected.writeCharacteristicWithResponseForService as jest.Mock).mock.calls.length === 1);
    const transactionId = (connected.writeCharacteristicWithResponseForService as jest.Mock).mock.calls[0][3] as string;
    await transport.cancelPendingWrites();
    await expect(write).rejects.toThrow('cancelled');
    expect(native.cancelTransaction).toHaveBeenCalledWith(transactionId);
  });

  it.each(['rejects', 'never settles'])('poisons writes when native cancellation %s', async (behavior) => {
    const connected = device({ writeCharacteristicWithResponseForService: jest.fn(() => new Promise(() => undefined)) });
    const cancelTransaction = behavior === 'rejects' ? jest.fn(async () => { throw new Error('cancel failed'); }) : jest.fn(() => new Promise<void>(() => undefined));
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected), cancelTransaction }), 'ios', behavior === 'rejects' ? 100 : 1);
    await transport.connect('ble-1');
    const write = transport.writeFrame('frame');
    await transport.cancelPendingWrites();
    await expect(write).rejects.toThrow();
    await expect(transport.writeFrame('next')).rejects.toThrow('unavailable until reconnect');
  });

  it('bounds cleanup when discovery fails and native cancellation hangs', async () => {
    const connected = device({
      discoverAllServicesAndCharacteristics: jest.fn(async () => { throw new Error('discovery failed'); }),
      cancelConnection: jest.fn(() => new Promise<Device>(() => undefined)),
    });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios', 1);
    await expect(transport.connect('ble-1')).rejects.toThrow('discovery failed');
  });

  it('deduplicates advertisements and cancels in-flight probes when scanning stops', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    let resolveConnect!: (value: Device) => void;
    const connected = device();
    const advertised = device({ isConnected: jest.fn(async () => false), connect: jest.fn(() => new Promise<Device>((resolve) => { resolveConnect = resolve; })) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'ios');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());
    scanCallback(null, advertised);
    scanCallback(null, advertised);
    await waitFor(() => (advertised.connect as jest.Mock).mock.calls.length === 1);
    expect(advertised.connect).toHaveBeenCalledTimes(1);
    stop();
    resolveConnect(connected);
    await Promise.resolve(); await Promise.resolve();
    expect(advertised.cancelConnection).toHaveBeenCalled();
    expect(found).not.toHaveBeenCalled();
  });

  it('cleans up a scan probe that resolves after its connection timeout', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    let resolveConnect!: (value: Device) => void;
    const connected = device();
    const advertised = device({ isConnected: jest.fn(async () => false), connect: jest.fn(() => new Promise<Device>((resolve) => { resolveConnect = resolve; })) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'ios', 1);
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());
    scanCallback(null, advertised);
    await waitFor(() => (advertised.connect as jest.Mock).mock.calls.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    resolveConnect(connected);
    await waitFor(() => (connected.cancelConnection as jest.Mock).mock.calls.length === 1);
    expect(found).not.toHaveBeenCalled();
    stop();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not reached');
}
