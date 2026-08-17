import { fromByteArray } from 'base64-js';
import type { BleManager, Characteristic, Descriptor, Device } from 'react-native-ble-plx';
import { ReactNativeBleTransport } from './ReactNativeBleTransport';

const descriptor = (value: string): Descriptor => ({ value } as Descriptor);

function device(overrides: Partial<Device> = {}): Device {
  const base: Record<string, unknown> = {
    id: 'ble-1', name: null, mtu: 185, rssi: -42,
    isConnected: jest.fn(async () => true), cancelConnection: jest.fn(async () => null as unknown as Device),
    requestMTU: jest.fn(async () => ({ ...base, mtu: 517 })),
    discoverAllServicesAndCharacteristics: jest.fn(async () => base),
    connect: jest.fn(async () => base),
    readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode('{"protocolVersion":1,"desktopId":"pc-1","displayName":"Desk","platform":"windows"}')) })),
    readDescriptorForService: jest.fn(async () => descriptor('AQA=')),
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

  it('waits for Android notification descriptor readiness after subscribing', async () => {
    const calls: string[] = [];
    const connected = device({
      monitorCharacteristicForService: jest.fn(() => { calls.push('subscribe'); return { remove: jest.fn() }; }),
      readDescriptorForService: jest.fn(async () => { calls.push('ready'); return descriptor('AQA='); }),
    });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'android');
    await transport.connect('ble-1');
    const unsubscribe = transport.subscribe(jest.fn(), jest.fn());
    await transport.notificationsReady();
    expect(calls).toEqual(['subscribe', 'ready']);
    unsubscribe();
  });

  it('rejects when Android notifications are not enabled', async () => {
    const connected = device({ readDescriptorForService: jest.fn(async () => descriptor('AAA=')) });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'android');
    await transport.connect('ble-1');
    await expect(transport.notificationsReady()).rejects.toThrow('could not be enabled');
  });

  it('does not read the Android notification descriptor on iOS', async () => {
    const connected = device();
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');
    await transport.connect('ble-1');
    await transport.notificationsReady();
    expect(connected.readDescriptorForService).not.toHaveBeenCalled();
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

  it('deduplicates rotating addresses for the same named PC while a probe is in flight', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    let releaseConnect!: (value: Device) => void;
    const connected = device();
    const first = device({ id: 'private-1', name: 'A9_MAX', isConnected: jest.fn(async () => false), connect: jest.fn(() => new Promise<Device>((resolve) => { releaseConnect = resolve; })) });
    const rotated = device({ id: 'private-2', name: 'A9_MAX', isConnected: jest.fn(async () => false) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'android');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());

    scanCallback(null, first);
    await waitFor(() => (first.connect as jest.Mock).mock.calls.length === 1);
    scanCallback(null, rotated);
    expect(rotated.isConnected).not.toHaveBeenCalled();

    stop();
    releaseConnect(connected);
    await waitFor(() => (connected.cancelConnection as jest.Mock).mock.calls.length === 1);
    expect(found).not.toHaveBeenCalled();
  });

  it('deduplicates a rotated Windows address after the first probe completes', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const firstConnected = device({
      readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode('{"protocolVersion":1,"desktopId":"pc-1","displayName":"A9_MAX","platform":"windows"}')) } as Characteristic)),
    });
    const first = device({ id: 'private-1', name: 'A9_MAX', isConnected: jest.fn(async () => false), connect: jest.fn(async () => firstConnected) });
    const rotated = device({ id: 'private-2', name: 'A9_MAX', isConnected: jest.fn(async () => false) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'android');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());

    scanCallback(null, first);
    await waitFor(() => found.mock.calls.some(([desktop]) => desktop.desktopId === 'pc-1'));
    scanCallback(null, rotated);
    await Promise.resolve();

    expect(rotated.isConnected).not.toHaveBeenCalled();
    stop();
  });

  it('discovers multiple Macs that share the Switchify PC Bluetooth name', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const makeMac = (id: string, desktopId: string, displayName: string) => {
      const connected = device({
        readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, desktopId, displayName, platform: 'macos' }))) } as Characteristic)),
      });
      return device({ id, name: 'Switchify PC', isConnected: jest.fn(async () => false), connect: jest.fn(async () => connected) });
    };
    const first = makeMac('mac-1', 'pc-1', 'First Mac');
    const second = makeMac('mac-2', 'pc-2', 'Second Mac');
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'ios');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());

    scanCallback(null, first);
    await waitFor(() => found.mock.calls.some(([desktop]) => desktop.desktopId === 'pc-1'));
    scanCallback(null, second);
    await waitFor(() => found.mock.calls.some(([desktop]) => desktop.desktopId === 'pc-2'));

    expect(first.connect).toHaveBeenCalledTimes(1);
    expect(second.connect).toHaveBeenCalledTimes(1);
    stop();
  });

  it('can resolve the second of two same-name PCs', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const firstConnected = device();
    const first = device({ id: 'mac-1', name: 'Switchify PC', isConnected: jest.fn(async () => false), connect: jest.fn(async () => firstConnected) });
    const secondConfigured = device({ id: 'mac-2', name: 'Switchify PC', mtu: 185 });
    const secondConnected = device({
      id: 'mac-2', name: 'Switchify PC',
      readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode('{"protocolVersion":1,"desktopId":"pc-2","displayName":"Second Mac","platform":"macos"}')) } as Characteristic)),
      discoverAllServicesAndCharacteristics: jest.fn(async () => secondConfigured),
    });
    const second = device({ id: 'mac-2', name: 'Switchify PC', isConnected: jest.fn(async () => false), connect: jest.fn(async () => secondConnected) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'ios');

    const resolving = transport.resolveAndConnect('pc-2');
    await waitFor(() => typeof scanCallback === 'function');
    scanCallback(null, first);
    await waitFor(() => (firstConnected.cancelConnection as jest.Mock).mock.calls.length === 1);
    scanCallback(null, second);
    await expect(resolving).resolves.toMatchObject({ desktopId: 'pc-2', peripheralId: 'mac-2' });

    expect(first.connect).toHaveBeenCalledTimes(1);
    expect(second.connect).toHaveBeenCalledTimes(1);
    expect(secondConnected.cancelConnection).not.toHaveBeenCalled();
  });

  it('waits for cancelled discovery probe cleanup before a real connection', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    let releaseDiscovery!: (value: Device) => void;
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const probed = device({
      discoverAllServicesAndCharacteristics: jest.fn(() => new Promise<Device>((resolve) => { releaseDiscovery = resolve; })),
      cancelConnection: jest.fn(async () => { await cleanupGate; return null as unknown as Device; }),
    });
    const advertised = device({ isConnected: jest.fn(async () => false), connect: jest.fn(async () => probed) });
    const selected = device();
    const connectToDevice = jest.fn(async () => selected);
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }), connectToDevice });
    const transport = new ReactNativeBleTransport(native, 'android');
    const stop = transport.scan(jest.fn(), jest.fn());
    scanCallback(null, advertised);
    await waitFor(() => (probed.discoverAllServicesAndCharacteristics as jest.Mock).mock.calls.length === 1);
    stop();
    const connecting = transport.connect('selected');
    releaseDiscovery(probed);
    await Promise.resolve();
    expect(connectToDevice).not.toHaveBeenCalled();
    releaseCleanup();
    await connecting;
    expect(connectToDevice).toHaveBeenCalledWith('selected');
  });

  it('publishes the actual Windows Bluetooth device name', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const advertised = device({ name: 'Oliver Laptop' });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'android');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());
    scanCallback(null, advertised);
    await waitFor(() => found.mock.calls.length === 1);
    expect(found).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Oliver Laptop', platform: 'windows' }));
    stop();
  });

  it('hands a matching discovery connection directly to the authenticated session', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const configured = device({ isConnected: jest.fn(async () => true), mtu: 517 });
    const connected = device({ isConnected: jest.fn(async () => true), requestMTU: jest.fn(async () => configured) });
    const advertised = device({ isConnected: jest.fn(async () => false), connect: jest.fn(async () => connected) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'android');

    const resolving = transport.resolveAndConnect('pc-1');
    await waitFor(() => typeof scanCallback === 'function');
    scanCallback(null, advertised);
    const resolved = await resolving;

    expect(resolved).toMatchObject({ desktopId: 'pc-1', peripheralId: 'ble-1' });
    expect(advertised.connect).toHaveBeenCalledTimes(1);
    expect(connected.cancelConnection).not.toHaveBeenCalled();
    expect(connected.requestMTU).toHaveBeenCalledWith(517);
    expect(native.connectToDevice).not.toHaveBeenCalled();
    expect(native.stopDeviceScan).toHaveBeenCalled();
    expect(transport.maxWriteValueBytes()).toBe(514);
  });

  it('times out a saved-PC handoff, cancels probes, and ignores late advertisements', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const advertised = device({ isConnected: jest.fn(async () => false) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'ios', 1);

    const resolving = transport.resolveAndConnect('missing-pc');
    await waitFor(() => typeof scanCallback === 'function');
    await expect(resolving).rejects.toThrow('timed out');
    scanCallback(null, advertised);
    await Promise.resolve();

    expect(native.stopDeviceScan).toHaveBeenCalled();
    expect(advertised.connect).not.toHaveBeenCalled();
  });

  it('disconnects a retained saved-PC probe when session setup times out', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const connected = device({
      isConnected: jest.fn(async () => true),
      requestMTU: jest.fn(() => new Promise<Device>(() => undefined)),
    });
    const advertised = device({ isConnected: jest.fn(async () => false), connect: jest.fn(async () => connected) });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'android', 10);

    const resolving = transport.resolveAndConnect('pc-1');
    await waitFor(() => typeof scanCallback === 'function');
    scanCallback(null, advertised);
    await expect(resolving).rejects.toThrow('timed out');

    expect(connected.cancelConnection).toHaveBeenCalled();
    expect(() => transport.maxWriteValueBytes()).toThrow('No PC is connected');
  });

  it('waits for retained-probe cancellation before starting a replacement connection', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    let releaseMtu!: (value: Device) => void;
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const retained = device({
      isConnected: jest.fn(async () => true),
      requestMTU: jest.fn(() => new Promise<Device>((resolve) => { releaseMtu = resolve; })),
      cancelConnection: jest.fn(async () => { await cleanupGate; return null as unknown as Device; }),
    });
    const advertised = device({ isConnected: jest.fn(async () => false), connect: jest.fn(async () => retained) });
    const replacement = device();
    const connectToDevice = jest.fn(async () => replacement);
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }), connectToDevice });
    const transport = new ReactNativeBleTransport(native, 'android');

    const resolving = transport.resolveAndConnect('pc-1');
    const resolvingRejected = expect(resolving).rejects.toThrow('cancelled');
    await waitFor(() => typeof scanCallback === 'function');
    scanCallback(null, advertised);
    await waitFor(() => (retained.requestMTU as jest.Mock).mock.calls.length === 1);
    const connecting = transport.connect('replacement');
    await waitFor(() => (retained.cancelConnection as jest.Mock).mock.calls.length === 1);
    expect(connectToDevice).not.toHaveBeenCalled();

    releaseCleanup();
    releaseMtu(retained);
    await resolvingRejected;
    await connecting;
    expect(connectToDevice).toHaveBeenCalledWith('replacement');
  });

  it('waits for failed retained-probe setup cleanup before retrying', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const retained = device({
      isConnected: jest.fn(async () => true),
      requestMTU: jest.fn(async () => { throw new Error('MTU failed'); }),
      cancelConnection: jest.fn(async () => { await cleanupGate; return null as unknown as Device; }),
    });
    const advertised = device({ isConnected: jest.fn(async () => false), connect: jest.fn(async () => retained) });
    const replacement = device();
    const connectToDevice = jest.fn(async () => replacement);
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }), connectToDevice });
    const transport = new ReactNativeBleTransport(native, 'android');

    const resolving = transport.resolveAndConnect('pc-1');
    const resolvingRejected = expect(resolving).rejects.toThrow('MTU failed');
    await waitFor(() => typeof scanCallback === 'function');
    scanCallback(null, advertised);
    await waitFor(() => (retained.cancelConnection as jest.Mock).mock.calls.length === 1);
    const connecting = transport.connect('replacement');
    expect(connectToDevice).not.toHaveBeenCalled();

    releaseCleanup();
    await resolvingRejected;
    await connecting;
    expect(connectToDevice).toHaveBeenCalledWith('replacement');
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
