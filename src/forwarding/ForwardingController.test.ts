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

const profile = (commands: string[], noAckCommands: string[] = []): PointerProfile => ({ displayId: 'd', scaleFactor: 1, bounds: { x: 0, y: 0, width: 1, height: 1 }, maxDelta: 1, recommendedDeltas: { small: 1, medium: 1, large: 1 }, capabilities: { noAckMouseMove: false, noAckCommands, supportedCommands: commands, mouseRepeat: { supported: false, enabled: false, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2_000 }, pointerSpeed: { supported: false, setSupported: false, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 1, effectiveMoveDelta: 1 }, displayNavigation: { supported: false, displayCount: 1 } } });
const catalog: ProtocolResponse = { kind: 'switchProfileCatalog', id: 'catalog', catalog: { catalogRevision: 1, profiles: [{ id: 'keyboard', version: 2, name: 'Keyboard', kind: 'mapped', bindings: [{ switchId: 1, label: 'Space', behavior: 'stateful' }] }] } };

describe('ForwardingController', () => {
  const generic = ['switch.profile.list', 'switch.session.start', 'switch.edge', 'switch.sync', 'switch.session.stop'];
  const fakeTimers = () => ({ interval: jest.fn(() => 1 as never), timeout: jest.fn(() => 2 as never), clear: jest.fn() });
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
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
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
});
