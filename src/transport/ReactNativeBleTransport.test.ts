import { fromByteArray } from 'base64-js';
import { ConnectionPriority, type BleManager, type Characteristic, type Descriptor, type Device } from 'react-native-ble-plx';
import { ReactNativeBleTransport } from './ReactNativeBleTransport';
import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';

const descriptor = (value: string): Descriptor => ({ value } as Descriptor);

function device(overrides: Partial<Device> = {}): Device {
  const base: Record<string, unknown> = {
    id: 'ble-1', name: null, localName: null, mtu: 185, rssi: -42,
    isConnected: jest.fn(async () => true), cancelConnection: jest.fn(async () => null as unknown as Device),
    requestConnectionPriority: jest.fn(async () => base),
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
  it('uses peer-specific reads for negotiated Linux replies, never notifications', async () => {
    const connected = device({ readCharacteristicForService: jest.fn(async (_service, characteristic) => ({
      value: characteristic.endsWith('7eb-1d6d-4d92-9ef0-1f89d3db21f4')
        ? fromByteArray(new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, desktopId: 'pc-1', responseTransport: 'read-v1' })))
        : '',
    } as Characteristic)) });
    const native = manager({ connectToDevice: jest.fn(async () => connected) });
    const transport = new ReactNativeBleTransport(native, 'ios');
    await transport.connect('ble-1');
    const stop = transport.subscribe(jest.fn(), jest.fn());
    await transport.notificationsReady();
    expect(connected.monitorCharacteristicForService).not.toHaveBeenCalled();
    expect(connected.readDescriptorForService).not.toHaveBeenCalled();
    expect(connected.readCharacteristicForService).toHaveBeenCalledWith(expect.any(String), '7a78f7ec-1d6d-4d92-9ef0-1f89d3db21f4', expect.any(String));
    stop();
    expect(() => transport.subscribe(jest.fn(), jest.fn())).toThrow('Reconnect');
    await transport.disconnect();
    expect(native.cancelTransaction).toHaveBeenCalled();
  });

  it('rejects unknown response transports without notification fallback', async () => {
    const connected = device({ readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode('{"protocolVersion":1,"desktopId":"pc","responseTransport":"future"}')) } as Characteristic)) });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');
    await expect(transport.connect('ble-1')).rejects.toThrow('status is invalid');
    expect(connected.monitorCharacteristicForService).not.toHaveBeenCalled();
    expect(connected.cancelConnection).toHaveBeenCalled();
  });
  it.each(['', 'private malformed', '{"protocolVersion":2}', '{"protocolVersion":1,"desktopId":"other-private"}'])('diagnoses rejected or nonmatching status (%s)', async (raw) => {
    const log = new DiagnosticLog();
    let callback!: (error: Error | null, value: Device | null) => void;
    const transport = new ReactNativeBleTransport(manager({ startDeviceScan: jest.fn((_u, _o, cb) => { callback = cb; }) }), 'ios', 100, undefined, log);
    const result = transport.resolveAndConnect('pc-1');
    const rejected = expect(result).rejects.toThrow('timed out');
    await waitFor(() => !!callback);
    callback(null, device({ readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode(raw)) } as Characteristic)) }));
    await rejected;
    const codes = log.snapshot().map((entry) => entry.code);
    expect(codes).toContain(raw.includes('other-private') ? 'ble_selected_match_not_matched' : 'ble_status_parse_failed');
    expect(codes.filter((code) => code === 'ble_resolution_timed_out')).toHaveLength(1);
    expect(codes).not.toContain('ble_resolution_succeeded');
    expect(log.export()).not.toMatch(/private|pc-1/);
    const before = log.export();
    callback(null, device());
    await Promise.resolve();
    expect(log.export()).toBe(before);
    await transport.disconnect();
  });

  it('records a matching handoff even with throwing diagnostic observers', async () => {
    const log = new DiagnosticLog();
    log.subscribe(() => { throw new Error('observer'); });
    let callback!: (error: Error | null, value: Device | null) => void;
    const transport = new ReactNativeBleTransport(manager({ startDeviceScan: jest.fn((_u, _o, cb) => { callback = cb; }) }), 'android', 1000, undefined, log);
    const result = transport.resolveAndConnect('pc-1');
    await waitFor(() => !!callback);
    callback(null, device());
    await result;
    const codes = log.snapshot().map((entry) => entry.code);
    expect(codes).toContain('ble_status_parse_succeeded');
    expect(codes).toContain('ble_selected_match_succeeded');
    expect(codes[0]).toBe('ble_resolution_succeeded');
    await transport.disconnect();
  });

  it('does not report cancelled resolution as a timeout or failure', async () => {
    const log = new DiagnosticLog();
    let callback!: (error: Error | null, value: Device | null) => void;
    const transport = new ReactNativeBleTransport(manager({ startDeviceScan: jest.fn((_u, _o, cb) => { callback = cb; }) }), 'ios', 1000, undefined, log);
    const result = transport.resolveAndConnect('pc-1');
    const rejected = expect(result).rejects.toThrow('cancelled');
    await waitFor(() => !!callback);
    await transport.disconnect();
    await rejected;
    callback(null, device());
    await Promise.resolve();
    expect(log.snapshot().map((entry) => entry.code)).toEqual(['ble_resolution_started']);
  });

  it('records scan startup failure without native error details', async () => {
    const log = new DiagnosticLog();
    const transport = new ReactNativeBleTransport(manager({ startDeviceScan: jest.fn(() => { throw new Error('private'); }) }), 'ios', 100, undefined, log);
    await expect(transport.resolveAndConnect('pc-1')).rejects.toThrow('discovery failed');
    expect(log.snapshot().map((entry) => entry.code)).toEqual(['ble_resolution_failed', 'ble_resolution_started']);
    expect(log.export()).not.toContain('private');
    await transport.disconnect();
  });
  it('records discovery status separately from the selected-PC connection', async () => {
    const log = new DiagnosticLog();
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const found = jest.fn();
    const candidate = device({ isConnected: jest.fn(async () => false) });
    const transport = new ReactNativeBleTransport(manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) }), 'android', 100, undefined, log);
    const stop = transport.scan(found, jest.fn());
    scanCallback(null, candidate);
    await waitFor(() => found.mock.calls.length === 1);
    expect(log.snapshot().map((entry) => entry.code).reverse()).toEqual([
      'ble_probe_connect_started', 'ble_probe_connect_succeeded',
      'ble_probe_services_started', 'ble_probe_services_succeeded',
      'ble_status_read_started', 'ble_status_read_succeeded',
      'ble_status_parse_started', 'ble_status_parse_succeeded',
    ]);
    stop();
  });

  it('records synchronous listener registration failure', async () => {
    const log = new DiagnosticLog();
    const connected = device({ monitorCharacteristicForService: jest.fn(() => { throw new Error('private'); }) });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios', 100, undefined, log);
    await transport.connect('ble-1');
    expect(() => transport.subscribe(jest.fn(), jest.fn())).toThrow();
    expect(log.snapshot()[0]?.code).toBe('ble_notifications_failed');
    expect(log.export()).not.toContain('private');
    await transport.disconnect();
  });

  it('records the Android connection stages in order through descriptor readiness', async () => {
    const log = new DiagnosticLog();
    const connected = device();
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'android', 100, undefined, log);
    await transport.connect('private-address');
    const remove = transport.subscribe(jest.fn(), jest.fn());
    await transport.notificationsReady();
    expect(log.snapshot().map((entry) => entry.code).reverse()).toEqual([
      'ble_connect_started', 'ble_connect_succeeded',
      'ble_priority_started', 'ble_priority_succeeded',
      'ble_mtu_started', 'ble_mtu_succeeded',
      'ble_services_started', 'ble_services_succeeded',
      'ble_notifications_started', 'ble_notifications_succeeded',
      'ble_notification_ready_started', 'ble_notification_ready_succeeded',
    ]);
    expect(log.export()).not.toContain('private-address');
    remove();
    await transport.disconnect();
  });

  it.each([
    ['connect', 'connectToDevice'], ['mtu', 'requestMTU'], ['services', 'discoverAllServicesAndCharacteristics'],
  ] as const)('identifies a %s failure without exporting native error details', async (stage, method) => {
    const log = new DiagnosticLog();
    const failure = jest.fn(async () => { throw new Error('private native payload and address'); });
    const connected = device(stage === 'connect' ? {} : { [method]: failure });
    const native = manager({ connectToDevice: stage === 'connect' ? failure : jest.fn(async () => connected) });
    const transport = new ReactNativeBleTransport(native, 'android', 100, undefined, log);
    await expect(transport.connect('private-address')).rejects.toThrow();
    expect(log.snapshot()[0]).toMatchObject({ code: `ble_${stage}_failed`, level: 'warning' });
    expect(log.export()).not.toContain('private');
    await transport.disconnect();
  });

  it('records a bounded MTU timeout as an MTU failure', async () => {
    const log = new DiagnosticLog();
    const connected = device({ requestMTU: jest.fn(() => new Promise<Device>(() => undefined)) });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'android', 1, undefined, log);
    await expect(transport.connect('ble-1')).rejects.toThrow('timed out');
    expect(log.snapshot()[0]?.code).toBe('ble_mtu_failed');
    await transport.disconnect();
  });

  it('does not report a cancelled or late connection as a failure or success', async () => {
    const log = new DiagnosticLog();
    let resolve!: (value: Device) => void;
    const connected = device();
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(() => new Promise<Device>((done) => { resolve = done; })) }), 'android', 100, undefined, log);
    const result = transport.connect('ble-1');
    const rejected = expect(result).rejects.toThrow();
    while (!resolve) await Promise.resolve();
    await transport.disconnect();
    resolve(connected);
    await rejected;
    expect(log.snapshot().map((entry) => entry.code)).toEqual(['ble_connect_started']);
  });

  it('records optional priority failure but continues, and skips Android-only stages on iOS', async () => {
    for (const platform of ['android', 'ios'] as const) {
      const log = new DiagnosticLog();
      const connected = device({ requestConnectionPriority: jest.fn(async () => { throw new Error('private'); }) });
      const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), platform, 100, undefined, log);
      await transport.connect('ble-1');
      await transport.notificationsReady();
      const codes = log.snapshot().map((entry) => entry.code);
      expect(codes).toContain('ble_services_succeeded');
      if (platform === 'android') expect(codes).toContain('ble_priority_failed');
      else expect(codes.some((code) => /priority|mtu|notification_ready/.test(code))).toBe(false);
      await transport.disconnect();
    }
  });

  it.each(['rejected read', 'disabled descriptor'] as const)('records notification readiness failure for %s', async (reason) => {
    const log = new DiagnosticLog();
    const connected = device({ readDescriptorForService: jest.fn(async () => {
      if (reason === 'rejected read') throw new Error('private descriptor error');
      return descriptor('AAA=');
    }) });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'android', 100, undefined, log);
    await transport.connect('ble-1');
    await expect(transport.notificationsReady()).rejects.toThrow();
    expect(log.snapshot()[0]?.code).toBe('ble_notification_ready_failed');
    expect(log.export()).not.toContain('private');
    await transport.disconnect();
  });

  it('ignores stale notification diagnostic callbacks after unsubscribe', async () => {
    const log = new DiagnosticLog();
    let fail!: () => void;
    const connected = device({ monitorCharacteristicForService: jest.fn((_service, _characteristic, listener) => {
      fail = () => listener(Object.assign(new Error('private'), {
        errorCode: 0 as const, attErrorCode: null, iosErrorCode: null, androidErrorCode: null, reason: 'private',
      }), null);
      return { remove: jest.fn() };
    }) });
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios', 100, undefined, log);
    await transport.connect('ble-1');
    const remove = transport.subscribe(jest.fn(), jest.fn());
    fail();
    expect(log.snapshot()[0]?.code).toBe('ble_notifications_failed');
    const count = log.snapshot().length;
    remove();
    fail();
    expect(log.snapshot()).toHaveLength(count);
    expect(log.export()).not.toContain('private');
    await transport.disconnect();
  });

  it('does not let diagnostic observer failures affect connection', async () => {
    const connected = device();
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios', 100, undefined, { addConnectionStage: () => { throw new Error('observer'); } });
    await expect(transport.connect('ble-1')).resolves.toBeUndefined();
    await transport.disconnect();
  });

  it('does not construct the native manager during launch or pre-initialization cleanup', async () => {
    const factory = jest.fn(() => manager());
    const transport = new ReactNativeBleTransport(null, 'ios', 10_000, factory);

    expect(factory).not.toHaveBeenCalled();
    await transport.disconnect();
    expect(factory).not.toHaveBeenCalled();
  });

  it('constructs the native manager once at the first Bluetooth operation', async () => {
    const native = manager();
    const factory = jest.fn(() => native);
    const transport = new ReactNativeBleTransport(null, 'ios', 10_000, factory);

    await expect(transport.availability()).resolves.toBe('ready');
    await expect(transport.availability()).resolves.toBe('ready');

    expect(factory).toHaveBeenCalledTimes(1);
    expect(native.state).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['PoweredOn', 'ready'],
    ['Unauthorized', 'unauthorized'],
  ] as const)('waits for a terminal Bluetooth state before reporting %s', async (terminalState, availability) => {
    let stateListener!: (state: 'PoweredOn' | 'Unauthorized') => void;
    const remove = jest.fn();
    const native = manager({
      state: jest.fn(async () => 'Unknown'),
      onStateChange: jest.fn((listener: typeof stateListener) => { stateListener = listener; return { remove }; }),
    });
    const transport = new ReactNativeBleTransport(native, 'ios');

    const result = transport.availability();
    await Promise.resolve();
    stateListener(terminalState);

    await expect(result).resolves.toBe(availability);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting while the user responds to the native Bluetooth permission prompt', async () => {
    jest.useFakeTimers();
    let stateListener!: (state: 'PoweredOn') => void;
    const remove = jest.fn();
    const native = manager({
      state: jest.fn(async () => 'Unknown'),
      onStateChange: jest.fn((listener: typeof stateListener) => { stateListener = listener; return { remove }; }),
    });
    const transport = new ReactNativeBleTransport(native, 'ios', 10);
    let settled = false;

    const result = transport.availability().then((availability) => { settled = true; return availability; });
    await Promise.resolve();
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    stateListener('PoweredOn');
    await expect(result).resolves.toBe('ready');
    expect(remove).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('requests high Android priority before the MTU and service discovery', async () => {
    const calls: string[] = [];
    const discovered = device({ mtu: 517, discoverAllServicesAndCharacteristics: jest.fn(async () => { calls.push('discover'); return discovered; }) });
    const prioritized = device({ requestMTU: jest.fn(async () => { calls.push('mtu'); return discovered; }) });
    const connected = device({ requestConnectionPriority: jest.fn(async () => { calls.push('priority'); return prioritized; }) });
    const native = manager({ connectToDevice: jest.fn(async () => connected) });
    const transport = new ReactNativeBleTransport(native, 'android');
    await transport.connect('ble-1');
    expect(connected.requestConnectionPriority).toHaveBeenCalledWith(ConnectionPriority.High);
    expect(prioritized.requestMTU).toHaveBeenCalledWith(517);
    expect(calls).toEqual(['priority', 'mtu', 'discover']);
    expect(transport.maxWriteValueBytes()).toBe(514);
  });

  it.each(['rejects', 'times out'] as const)('continues with balanced priority when the Android priority request %s', async (behavior) => {
    const connected = device({
      requestConnectionPriority: behavior === 'rejects'
        ? jest.fn(async () => { throw new Error('priority rejected'); })
        : jest.fn(() => new Promise<Device>(() => undefined)),
    });
    const transport = new ReactNativeBleTransport(
      manager({ connectToDevice: jest.fn(async () => connected) }),
      'android',
      behavior === 'rejects' ? 100 : 1,
    );

    await transport.connect('ble-1');

    expect(connected.requestMTU).toHaveBeenCalledWith(517);
    expect(connected.discoverAllServicesAndCharacteristics).toHaveBeenCalledTimes(1);
  });

  it('does not request connection priority on iOS', async () => {
    const connected = device();
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');

    await transport.connect('ble-1');

    expect(connected.requestConnectionPriority).not.toHaveBeenCalled();
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

  it('verifies the current PC without reconnecting or rediscovering services', async () => {
    const connected = device();
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');
    await transport.connect('ble-1');
    (connected.discoverAllServicesAndCharacteristics as jest.Mock).mockClear();
    (connected.readCharacteristicForService as jest.Mock).mockClear();

    await expect(transport.verifyConnection('pc-1')).resolves.toBe(true);

    expect(connected.isConnected).toHaveBeenCalledTimes(1);
    expect(connected.readCharacteristicForService).toHaveBeenCalledTimes(1);
    expect(connected.discoverAllServicesAndCharacteristics).not.toHaveBeenCalled();
    expect(connected.connect).not.toHaveBeenCalled();
  });

  it.each([
    ['native disconnect', { isConnected: jest.fn(async () => false) }],
    ['read rejection', { readCharacteristicForService: jest.fn(async () => { throw new Error('read failed'); }) }],
    ['empty status', { readCharacteristicForService: jest.fn(async () => ({ value: null })) }],
    ['malformed status', { readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode('not json')) })) }],
    ['wrong desktop', { readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode('{"protocolVersion":1,"desktopId":"other","displayName":"Desk","platform":"windows"}')) })) }],
  ] as const)('reports a failed health check for %s', async (_label, overrides) => {
    const connected = device();
    const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');
    await transport.connect('ble-1');
    Object.assign(connected, overrides);
    await expect(transport.verifyConnection('pc-1')).resolves.toBe(false);
  });

  it('bounds a connection health check to four seconds', async () => {
    jest.useFakeTimers();
    try {
      const connected = device();
      const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');
      await transport.connect('ble-1');
      (connected.readCharacteristicForService as jest.Mock).mockImplementation(() => new Promise<Characteristic>(() => undefined));
      let settled = false;
      const result = transport.verifyConnection('pc-1').then((value) => { settled = true; return value; });
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(3_999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not continue a timed-out health check into a status read', async () => {
    jest.useFakeTimers();
    try {
      let resolveConnected!: (connected: boolean) => void;
      const connected = device({ isConnected: jest.fn(() => new Promise<boolean>((resolve) => { resolveConnected = resolve; })) });
      const transport = new ReactNativeBleTransport(manager({ connectToDevice: jest.fn(async () => connected) }), 'ios');
      await transport.connect('ble-1');
      const result = transport.verifyConnection('pc-1');
      (connected.readCharacteristicForService as jest.Mock).mockClear();

      await jest.advanceTimersByTimeAsync(4_000);
      await expect(result).resolves.toBe(false);
      resolveConnected(true);
      await Promise.resolve();

      expect(connected.readCharacteristicForService).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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

  it('prevents stale setup after a replacement interrupts a pending priority request', async () => {
    const firstDevice = device({ requestConnectionPriority: jest.fn(() => new Promise<Device>(() => undefined)) });
    const secondDevice = device();
    const connectToDevice = jest.fn()
      .mockResolvedValueOnce(firstDevice)
      .mockResolvedValueOnce(secondDevice);
    const transport = new ReactNativeBleTransport(manager({ connectToDevice }), 'android');

    const first = transport.connect('first');
    const firstRejected = expect(first).rejects.toThrow('cancelled');
    await waitFor(() => (firstDevice.requestConnectionPriority as jest.Mock).mock.calls.length === 1);
    const second = transport.connect('second');

    await firstRejected;
    await second;
    expect(firstDevice.requestMTU).not.toHaveBeenCalled();
    expect(firstDevice.discoverAllServicesAndCharacteristics).not.toHaveBeenCalled();
    expect(secondDevice.requestConnectionPriority).toHaveBeenCalledWith(ConnectionPriority.High);
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

  it('probes a distinct same-name address while another probe is in flight', async () => {
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
    expect(rotated.isConnected).toHaveBeenCalledTimes(1);

    stop();
    releaseConnect(connected);
    await waitFor(() => (connected.cancelConnection as jest.Mock).mock.calls.length === 1);
    expect(found).not.toHaveBeenCalled();
  });

  it('deduplicates a known Windows address but probes a new same-name address', async () => {
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
    scanCallback(null, first);
    scanCallback(null, rotated);
    await Promise.resolve();

    expect(first.connect).toHaveBeenCalledTimes(1);
    expect(rotated.isConnected).toHaveBeenCalledTimes(1);
    stop();
  });

  it.each(['android', 'ios'] as const)('discovers overlapping same-name PCs on %s', async (platform) => {
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
    const transport = new ReactNativeBleTransport(native, platform);
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());

    scanCallback(null, first);
    scanCallback(null, second);
    await waitFor(() => found.mock.calls.some(([desktop]) => desktop.desktopId === 'pc-1'));
    await waitFor(() => found.mock.calls.some(([desktop]) => desktop.desktopId === 'pc-2'));

    expect(first.connect).toHaveBeenCalledTimes(1);
    expect(second.connect).toHaveBeenCalledTimes(1);
    stop();
  });

  it('limits concurrent same-name probes to four and cancels them on stop', async () => {
    let callback!: (error: Error | null, value: Device | null) => void;
    const native = manager({ startDeviceScan: jest.fn((_u, _o, cb) => { callback = cb; }) });
    const transport = new ReactNativeBleTransport(native, 'android');
    const peers = Array.from({ length: 5 }, (_, index) => device({
      id: `peer-${index}`, name: 'Switchify PC',
      isConnected: jest.fn(() => new Promise<boolean>(() => undefined)),
    }));
    const stop = transport.scan(jest.fn(), jest.fn());
    peers.forEach((peer) => callback(null, peer));
    peers.slice(0, 4).forEach((peer) => expect(peer.isConnected).toHaveBeenCalledTimes(1));
    expect(peers[4]!.isConnected).not.toHaveBeenCalled();
    stop();
    peers.slice(0, 4).forEach((peer) => expect(peer.cancelConnection).toHaveBeenCalled());
    await transport.disconnect();
  });

  it.each(['android', 'ios'] as const)('resolves overlapping same-name PCs on %s without starving the target', async (platform) => {
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
    const transport = new ReactNativeBleTransport(native, platform);

    const resolving = transport.resolveAndConnect('pc-2');
    await waitFor(() => typeof scanCallback === 'function');
    scanCallback(null, first);
    scanCallback(null, second);
    scanCallback(null, first);
    scanCallback(null, second);
    await expect(resolving).resolves.toMatchObject({ desktopId: 'pc-2', peripheralId: 'mac-2' });

    expect(first.connect).toHaveBeenCalledTimes(1);
    expect(second.connect).toHaveBeenCalledTimes(1);
    expect(secondConnected.cancelConnection).not.toHaveBeenCalled();
  });

  it.each(['android', 'ios'] as const)('queues a target behind four active probes on %s', async (platform) => {
    let callback!: (error: Error | null, value: Device | null) => void;
    const releases: (() => void)[] = [];
    const blockers = Array.from({ length: 4 }, (_, index) => device({
      id: `other-${index}`, name: 'Switchify PC',
      discoverAllServicesAndCharacteristics: jest.fn(() => new Promise<Device>((resolve) => {
        releases.push(() => resolve(device()));
      })),
    }));
    const target = device({ id: 'target', name: 'Switchify PC', readCharacteristicForService: jest.fn(async () => ({
      value: fromByteArray(new TextEncoder().encode('{"protocolVersion":1,"desktopId":"wanted"}')),
    } as Characteristic)) });
    const transport = new ReactNativeBleTransport(manager({ startDeviceScan: jest.fn((_u, _o, cb) => { callback = cb; }) }), platform);
    const resolving = transport.resolveAndConnect('wanted');
    await waitFor(() => !!callback);
    blockers.forEach((peer) => callback(null, peer));
    await waitFor(() => releases.length === 4);
    callback(null, target);
    expect(target.isConnected).not.toHaveBeenCalled();
    releases.forEach((release) => release());
    await expect(resolving).resolves.toMatchObject({ desktopId: 'wanted' });
    expect(target.isConnected).toHaveBeenCalledTimes(1);
    await transport.disconnect();
  });

  it('retains the newest Windows address by evicting the oldest at capacity', async () => {
    let callback!: (error: Error | null, value: Device | null) => void;
    const found = jest.fn();
    const transport = new ReactNativeBleTransport(manager({ startDeviceScan: jest.fn((_u, _o, cb) => { callback = cb; }) }), 'android');
    const stop = transport.scan(found, jest.fn());
    const peers = Array.from({ length: 257 }, (_, index) => device({ id: `windows-${index}` }));
    for (const [index, peer] of peers.entries()) {
      callback(null, peer);
      await waitFor(() => found.mock.calls.length === index + 1);
    }
    callback(null, peers[256]!);
    expect(peers[256]!.isConnected).toHaveBeenCalledTimes(1);
    callback(null, peers[0]!);
    expect(peers[0]!.isConnected).toHaveBeenCalledTimes(2);
    stop();
    await transport.disconnect();
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
    const advertised = device({ name: 'Oliver Laptop', localName: 'Switchify PC' });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'android');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());
    scanCallback(null, advertised);
    await waitFor(() => found.mock.calls.length === 1);
    expect(found).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Oliver Laptop', platform: 'windows' }));
    expect(advertised.requestConnectionPriority).not.toHaveBeenCalled();
    stop();
  });

  it('publishes the advertised Windows local name on iOS', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const advertised = device({ name: 'Switchify PC', localName: 'Owen’s Windows PC' });
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'ios');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());

    scanCallback(null, advertised);
    await waitFor(() => found.mock.calls.length === 1);

    expect(found).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Owen’s Windows PC', platform: 'windows' }));
    stop();
  });

  it('discovers multiple Windows PCs with a generic iOS device name', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const makeWindowsPc = (id: string, desktopId: string, localName: string) => device({
      id,
      name: 'Switchify PC',
      localName,
      readCharacteristicForService: jest.fn(async () => ({ value: fromByteArray(new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, desktopId, displayName: 'Switchify PC', platform: 'windows' }))) } as Characteristic)),
    });
    const first = makeWindowsPc('windows-1', 'pc-1', 'Office PC');
    const second = makeWindowsPc('windows-2', 'pc-2', 'Living Room PC');
    const native = manager({ startDeviceScan: jest.fn((_uuids, _options, callback) => { scanCallback = callback; }) });
    const transport = new ReactNativeBleTransport(native, 'ios');
    const found = jest.fn();
    const stop = transport.scan(found, jest.fn());

    scanCallback(null, first);
    await waitFor(() => found.mock.calls.some(([desktop]) => desktop.desktopId === 'pc-1'));
    scanCallback(null, second);
    await waitFor(() => found.mock.calls.some(([desktop]) => desktop.desktopId === 'pc-2'));

    expect(found.mock.calls.map(([desktop]) => desktop.displayName)).toEqual(['Office PC', 'Living Room PC']);
    stop();
  });

  it('hands a matching discovery connection directly to the authenticated session', async () => {
    let scanCallback!: (error: Error | null, value: Device | null) => void;
    const configured = device({ isConnected: jest.fn(async () => true), mtu: 517 });
    const prioritized = device({ isConnected: jest.fn(async () => true), requestMTU: jest.fn(async () => configured) });
    const connected = device({ isConnected: jest.fn(async () => true), requestConnectionPriority: jest.fn(async () => prioritized) });
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
    expect(connected.requestConnectionPriority).toHaveBeenCalledWith(ConnectionPriority.High);
    expect(prioritized.requestMTU).toHaveBeenCalledWith(517);
    expect(configured.discoverAllServicesAndCharacteristics).toHaveBeenCalledTimes(1);
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
