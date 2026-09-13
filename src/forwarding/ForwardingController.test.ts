import type { BridgeEvent, BridgeSnapshot, SwitchifyBridge } from '@/bridge/types';
import type { PointerProfile, ProtocolResponse } from '@/domain/protocol/types';
import { ForwardingController, type ForwardingConnection } from './ForwardingController';

class FakeBridge implements SwitchifyBridge {
  value: BridgeSnapshot = { version: 1, captureAvailable: true, externalSwitches: Array.from({ length: 10 }, (_, index) => ({ keyCode: 20 + index, name: `Switch ${index + 1}` })) };
  listeners = new Set<(event: BridgeEvent) => void>(); active: [number, boolean][] = []; generation = 40;
  snapshot = () => this.value; subscribe = (listener: (event: BridgeEvent) => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  connect = async () => true; disconnect = async () => undefined; nextGeneration = () => ++this.generation;
  setRepeatActive = async () => true; setForwardingActive = async (generation: number, active: boolean) => { this.active.push([generation, active]); return true; };
  emit(event: BridgeEvent) { this.listeners.forEach((listener) => listener(event)); }
}

const profile = (commands: string[], noAckCommands: string[] = []): PointerProfile => ({ displayId: 'd', scaleFactor: 1, bounds: { x: 0, y: 0, width: 1, height: 1 }, maxDelta: 1, recommendedDeltas: { small: 1, medium: 1, large: 1 }, capabilities: { noAckMouseMove: false, noAckCommands, supportedCommands: commands, mouseRepeat: { supported: false, enabled: false, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2_000 }, keyRepeat: { supported: false, enabled: false, intervalMs: 250, initialDelayMs: 500, minIntervalMs: 100, maxIntervalMs: 1000, repeatableKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Delete', 'PageUp', 'PageDown'] }, pointerSpeed: { supported: false, setSupported: false, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 1, effectiveMoveDelta: 1 }, displayNavigation: { supported: false, displayCount: 1 } } });
const catalog: ProtocolResponse = { kind: 'switchProfileCatalog', id: 'catalog', catalog: { catalogRevision: 1, profiles: [{ id: 'keyboard', version: 2, name: 'Keyboard', kind: 'mapped', bindings: [{ switchId: 1, label: 'Space', behavior: 'stateful' }] }] } };

describe('ForwardingController', () => {
  const generic = ['switch.profile.list', 'switch.session.start', 'switch.edge', 'switch.sync', 'switch.session.stop'];
  const fakeTimers = () => ({ interval: jest.fn(() => 1 as never), timeout: jest.fn(() => 2 as never), clear: jest.fn() });
  it.each(['cancelled', 'held', 'replaced'])('stops scanning without sending a selecting release when %s', async (reason) => {
    const bridge = new FakeBridge();
    const scanCatalog: ProtocolResponse = { kind: 'switchProfileCatalog', id: 'catalog', catalog: { catalogRevision: 1, profiles: [{ id: 'builtin.switchify-scanning', version: 1, name: 'Switchify scanning', kind: 'scanning', bindings: [{ switchId: 1, label: 'Select', behavior: 'stateful' }] }] } };
    const connection = { request: jest.fn(async () => scanCatalog), send: jest.fn(async () => true) };
    const pc = profile(generic, ['switch.edge']); pc.capabilities.switchScanning = true;
    const controller = new ForwardingController(connection, bridge, pc, 5000, fakeTimers(), () => 'session');
    await controller.loadProfiles();
    expect(connection.request).toHaveBeenCalledWith('switch.profile.list', { includeScanning: true });
    await controller.start();
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 1, keyCode: 20, down: true, downTimeMs: 0, eventTimeMs: 0, cancelled: false });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 2, keyCode: 20, down: reason === 'replaced', downTimeMs: reason === 'replaced' ? 1 : 0, eventTimeMs: reason === 'held' ? 5000 : 20, cancelled: reason === 'cancelled' });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(controller.snapshot().phase).toBe('idle');
    expect(connection.send).toHaveBeenCalledWith('switch.edge', expect.objectContaining({ state: 'down' }), 'ack');
    expect(connection.send).not.toHaveBeenCalledWith('switch.edge', expect.objectContaining({ state: 'up' }), expect.anything());
    expect(connection.send).toHaveBeenCalledWith('switch.session.stop', expect.anything());
    await controller.cleanup();
  });
  it.each(['stop', 'sync'])('preserves queued edge semantics across delayed acknowledgement and %s', async (scenario) => {
    const bridge = new FakeBridge(); let resolveDown: (ok: boolean) => void = () => undefined;
    const down = new Promise<boolean>((resolve) => { resolveDown = resolve; });
    const scanCatalog: ProtocolResponse = { kind: 'switchProfileCatalog', id: 'catalog', catalog: { catalogRevision: 1, profiles: [{ id: 'builtin.switchify-scanning', version: 1, name: 'Switchify scanning', kind: 'scanning', bindings: [{ switchId: 1, label: 'Select', behavior: 'stateful' }] }] } };
    const send = jest.fn((command: string, payload?: import('@/domain/protocol/types').JsonObject) => command === 'switch.edge' && payload?.state === 'down' ? down : Promise.resolve(true));
    const connection = { request: jest.fn(async () => scanCatalog), send };
    const timers = { ...fakeTimers(), interval: jest.fn((callback: () => void, _ms: number) => { void callback; return 1 as never; }) }; let interval: () => void = () => undefined;
    timers.interval.mockImplementation((callback) => { interval = callback; return 1 as never; });
    const controller = new ForwardingController(connection, bridge, profile(generic), 5000, timers, () => 'session');
    await controller.loadProfiles(); await controller.start();
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 1, keyCode: 20, down: true, downTimeMs: 0, eventTimeMs: 0, cancelled: false });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    if (scenario === 'sync') interval();
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 2, keyCode: 20, down: false, downTimeMs: 0, eventTimeMs: 50, cancelled: false });
    const stopped = scenario === 'stop' ? controller.stop() : null;
    resolveDown(true); for (let i = 0; i < 30; i++) await Promise.resolve();
    if (scenario === 'stop') {
      await stopped;
      expect(send.mock.calls.filter(([command, payload]) => command === 'switch.edge' && payload?.state === 'up')).toHaveLength(0);
    } else {
      const syncs = send.mock.calls.filter(([command]) => command === 'switch.sync');
      expect(syncs[1]?.[1]?.pressedSwitchIds).toEqual([1]);
      expect(send.mock.calls.filter(([command, payload]) => command === 'switch.edge' && payload?.state === 'up')).toHaveLength(1);
    }
    await controller.cleanup();
  });
  it('maps eight switches, sends ordered edges, and cleans up', async () => {
    const bridge = new FakeBridge(); const connection = { request: jest.fn(async () => catalog), send: jest.fn(async () => true) } as ForwardingConnection;
    const controller = new ForwardingController(connection, bridge, profile(generic, ['switch.edge']), 5_000, fakeTimers(), () => 'session');
    await controller.loadProfiles(); expect(await controller.start()).toBe(true);
    expect(controller.snapshot().mappings).toHaveLength(8); expect(controller.snapshot().overflow).toHaveLength(2);
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 1, keyCode: 20, down: true, downTimeMs: 10, eventTimeMs: 10, cancelled: false });
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 2, keyCode: 20, down: false, downTimeMs: 10, eventTimeMs: 20, cancelled: false });
    await Promise.resolve(); await Promise.resolve();
    expect(connection.send).toHaveBeenCalledWith('switch.session.start', expect.objectContaining({ profileId: 'keyboard', switchCount: 8 }));
    expect(connection.send).toHaveBeenCalledWith('switch.edge', expect.objectContaining({ switchId: 1, state: 'down', sequence: 2 }), 'none');
    await controller.stop(); expect(bridge.active).toEqual([[41, true], [41, false]]);
  });

  it('uses a desktop-compatible UUID session ID', async () => {
    const bridge = new FakeBridge(); const connection = { request: jest.fn(async () => catalog), send: jest.fn(async () => true) } as ForwardingConnection;
    const controller = new ForwardingController(connection, bridge, profile(generic), 5_000, fakeTimers(), () => '5d59aaf0-f77b-4dd5-a522-8665bc8bcf51');
    await controller.loadProfiles();
    expect(await controller.start()).toBe(true);
    expect(connection.send).toHaveBeenCalledWith('switch.session.start', expect.objectContaining({ sessionId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }));
  });

  it('synthesizes release and repress for a replacement press', async () => {
    const bridge = new FakeBridge(); const connection = { request: jest.fn(async () => catalog), send: jest.fn(async () => true) } as ForwardingConnection;
    const controller = new ForwardingController(connection, bridge, profile(generic), 5_000, fakeTimers(), () => '00000000-0000-4000-8000-000000000001');
    await controller.loadProfiles(); await controller.start();
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 1, keyCode: 20, down: true, downTimeMs: 10, eventTimeMs: 10, cancelled: false });
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 2, keyCode: 20, down: true, downTimeMs: 20, eventTimeMs: 20, cancelled: false });
    for (let index = 0; index < 30; index += 1) await Promise.resolve();
    const edges = (connection.send as jest.Mock).mock.calls.filter(([command]) => command === 'switch.edge').map(([, payload]) => payload.state);
    expect(edges).toEqual(['down', 'up', 'down']);
  });

  it('fails closed on a missing edge and supports legacy Grid 3', async () => {
    const bridge = new FakeBridge(); const connection = { request: jest.fn(async () => null), send: jest.fn(async () => true) } as ForwardingConnection;
    const controller = new ForwardingController(connection, bridge, profile(['grid.switch.set', 'grid.switch.sync'], ['grid.switch.set']), 5_000, fakeTimers(), () => 'legacy');
    await controller.loadProfiles(); await controller.start();
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 2, keyCode: 20, down: true, downTimeMs: 1, eventTimeMs: 1, cancelled: false });
    await Promise.resolve(); await Promise.resolve();
    expect(controller.snapshot().phase).toBe('idle'); expect(controller.snapshot().message).toMatch(/missed/i);
    expect(connection.send).toHaveBeenCalledWith('grid.switch.sync', expect.objectContaining({ pressedSwitchIds: [] }));
  });

  it('requires capture and stops after a five-second hold release', async () => {
    const bridge = new FakeBridge(); const connection = { request: jest.fn(async () => catalog), send: jest.fn(async () => true) } as ForwardingConnection;
    const safetyStop = jest.fn();
    const controller = new ForwardingController(connection, bridge, profile(generic), 5_000, fakeTimers(), () => '00000000-0000-4000-8000-000000000002', safetyStop);
    await controller.loadProfiles(); bridge.value = { version: 1, captureAvailable: false, externalSwitches: [] }; expect(await controller.start()).toBe(false);
    bridge.value = { version: 1, captureAvailable: true, externalSwitches: [{ keyCode: 20, name: 'Switch' }] }; expect(await controller.start()).toBe(true);
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 1, keyCode: 20, down: true, downTimeMs: 0, eventTimeMs: 0, cancelled: false });
    bridge.emit({ type: 'switchEdge', generation: 41, sequence: 2, keyCode: 20, down: false, downTimeMs: 0, eventTimeMs: 5_000, cancelled: false });
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
    expect(controller.snapshot().phase).toBe('idle');
    expect(safetyStop).toHaveBeenCalledTimes(1);
  });

  it('stops safely when the configured external switch set changes', async () => {
    const bridge = new FakeBridge(); const connection = { request: jest.fn(async () => catalog), send: jest.fn(async () => true) } as ForwardingConnection;
    const safetyStop = jest.fn();
    const controller = new ForwardingController(connection, bridge, profile(generic), 5_000, fakeTimers(), () => '00000000-0000-4000-8000-000000000003', safetyStop);
    await controller.loadProfiles(); await controller.start();
    bridge.emit({ type: 'snapshot', version: 1, captureAvailable: true, externalSwitches: [{ keyCode: 20, name: 'Renamed switch' }, ...bridge.value.externalSwitches.slice(1)] });
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    expect(controller.snapshot().phase).toBe('idle');
    expect(safetyStop).toHaveBeenCalledTimes(1);
  });

  it('cannot reactivate after cleanup while session start is in flight', async () => {
    let resolveStart!: (value: boolean) => void;
    const pendingStart = new Promise<boolean>((resolve) => { resolveStart = resolve; });
    const bridge = new FakeBridge();
    const connection = {
      request: jest.fn(async () => catalog),
      send: jest.fn((command: string) => command === 'switch.session.start' ? pendingStart : Promise.resolve(true)),
    } as ForwardingConnection;
    const controller = new ForwardingController(connection, bridge, profile(generic), 5_000, fakeTimers(), () => '00000000-0000-4000-8000-000000000004');
    await controller.loadProfiles();
    const starting = controller.start();
    await Promise.resolve();
    await controller.cleanup();
    resolveStart(true);
    expect(await starting).toBe(false);
    expect(bridge.active.some(([, active]) => active)).toBe(false);
    expect(controller.snapshot().phase).toBe('idle');
  });

  it('cancels an in-flight start when configured switches change', async () => {
    let resolveStart!: (value: boolean) => void;
    const pendingStart = new Promise<boolean>((resolve) => { resolveStart = resolve; });
    const bridge = new FakeBridge(); const safetyStop = jest.fn();
    const connection = {
      request: jest.fn(async () => catalog),
      send: jest.fn((command: string) => command === 'switch.session.start' ? pendingStart : Promise.resolve(true)),
    } as ForwardingConnection;
    const controller = new ForwardingController(connection, bridge, profile(generic), 5_000, fakeTimers(), () => '00000000-0000-4000-8000-000000000005', safetyStop);
    await controller.loadProfiles();
    const starting = controller.start();
    await Promise.resolve();
    bridge.emit({ type: 'snapshot', version: 1, captureAvailable: true, externalSwitches: [{ keyCode: 5, name: 'New first switch' }, ...bridge.value.externalSwitches] });
    resolveStart(true);
    expect(await starting).toBe(false);
    expect(controller.snapshot().phase).toBe('idle');
    expect(safetyStop).toHaveBeenCalledTimes(1);
    expect(bridge.active.some(([, active]) => active)).toBe(false);
  });
});
