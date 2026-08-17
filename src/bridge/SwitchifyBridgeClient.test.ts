import type { NativeSwitchifyAndroidBridge } from './NativeSwitchifyAndroidBridge';
import { SwitchifyBridgeClient } from './SwitchifyBridgeClient';
import type { BridgeEvent } from './types';

function nativeBridge() {
  let listener: ((event: BridgeEvent) => void) | null = null;
  const native = {
    addListener: jest.fn((_name: string, next: (event: BridgeEvent) => void) => { listener = next; return { remove: jest.fn() }; }),
    connectAsync: jest.fn(async () => true),
    getVersionAsync: jest.fn(async () => 1),
    disconnectAsync: jest.fn(async () => undefined),
    snapshotAsync: jest.fn(async () => ({ version: 1, captureAvailable: true, externalSwitches: [{ keyCode: 42, name: 'Primary' }] })),
    setRepeatActiveAsync: jest.fn(async () => true),
    setForwardingActiveAsync: jest.fn(async () => true),
  } as unknown as NativeSwitchifyAndroidBridge;
  return { native, emit: (event: BridgeEvent) => listener?.(event) };
}

describe('SwitchifyBridgeClient', () => {
  it('tracks sanitized snapshots and forwards generation-scoped state', async () => {
    const host = nativeBridge();
    const bridge = new SwitchifyBridgeClient(host.native);
    const events: BridgeEvent[] = [];
    bridge.subscribe((event) => events.push(event));
    expect(await bridge.connect()).toBe(true);
    expect(bridge.snapshot()).toEqual({ version: 1, captureAvailable: true, externalSwitches: [{ keyCode: 42, name: 'Primary' }] });
    const generation = bridge.nextGeneration();
    expect(await bridge.setRepeatActive(generation, true)).toBe(true);
    expect(await bridge.setForwardingActive(generation, true)).toBe(true);
    expect((host.native.setRepeatActiveAsync as jest.Mock)).toHaveBeenCalledWith(generation, true);
    expect(events).toHaveLength(1);
    expect(host.native.snapshotAsync).toHaveBeenCalledTimes(1);
  });

  it('becomes unavailable after disconnect', async () => {
    const host = nativeBridge();
    const bridge = new SwitchifyBridgeClient(host.native);
    await bridge.connect();
    host.emit({ type: 'snapshot', version: 1, captureAvailable: true, externalSwitches: [] });
    await bridge.disconnect();
    expect(bridge.snapshot().captureAvailable).toBe(false);
  });

  it('ignores a snapshot that completes after disconnect', async () => {
    const host = nativeBridge();
    let resolveSnapshot!: (snapshot: { version: number; captureAvailable: boolean; externalSwitches: never[] }) => void;
    (host.native.snapshotAsync as jest.Mock).mockImplementation(() => new Promise((resolve) => { resolveSnapshot = resolve; }));
    const bridge = new SwitchifyBridgeClient(host.native);
    const connecting = bridge.connect();
    await Promise.resolve();
    await Promise.resolve();
    await bridge.disconnect();
    resolveSnapshot({ version: 1, captureAvailable: true, externalSwitches: [] });
    expect(await connecting).toBe(false);
    expect(bridge.snapshot()).toEqual({ version: 0, captureAvailable: false, externalSwitches: [] });
  });

  it('fails closed for an unsupported bridge snapshot version', async () => {
    const host = nativeBridge();
    const bridge = new SwitchifyBridgeClient(host.native);
    await bridge.connect();
    host.emit({ type: 'snapshot', version: 2, captureAvailable: true, externalSwitches: [{ keyCode: 42, name: 'Primary' }] });
    expect(bridge.snapshot()).toEqual({ version: 0, captureAvailable: false, externalSwitches: [] });
    const events: BridgeEvent[] = [];
    bridge.subscribe((event) => events.push(event));
    host.emit({ type: 'snapshot', version: 2, captureAvailable: true, externalSwitches: [{ keyCode: 42, name: 'Primary' }] });
    expect(events).toEqual([{ type: 'snapshot', version: 0, captureAvailable: false, externalSwitches: [] }]);
  });
});
