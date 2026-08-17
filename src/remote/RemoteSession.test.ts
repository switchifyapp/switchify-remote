import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { RemoteSession } from './RemoteSession';
import type { BridgeEvent, BridgeSnapshot, SwitchifyBridge } from '@/bridge/types';

const allCommands = ['mouse.move', 'mouse.click', 'mouse.doubleClick', 'mouse.rightClick', 'mouse.scroll', 'mouse.dragStart', 'mouse.dragEnd', 'mouse.repeat.start', 'mouse.repeat.stop', 'pointer.speed.set', 'pointer.display.move', 'keyboard.key', 'keyboard.modifierDown', 'keyboard.modifierUp', 'keyboard.shortcut', 'keyboard.typeText', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close', 'window.control'];
const profile = (supportedCommands = allCommands): PointerProfile => ({ displayId: 'display', scaleFactor: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, maxDelta: 128, recommendedDeltas: { small: 32, medium: 64, large: 128 }, capabilities: { noAckCommands: [], noAckMouseMove: false, supportedCommands, mouseRepeat: { supported: true, enabled: true, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2000 }, pointerSpeed: { supported: true, setSupported: true, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 64, effectiveMoveDelta: 64 }, displayNavigation: { supported: true, displayCount: 2 } } });

function fakeBridge() {
  let listener: ((event: BridgeEvent) => void) | null = null;
  let generation = 100;
  const bridge: SwitchifyBridge = {
    snapshot: () => ({ version: 1, captureAvailable: true, externalSwitches: [] } satisfies BridgeSnapshot),
    subscribe: (next) => { listener = next; return () => { listener = null; }; },
    connect: async () => true,
    disconnect: async () => undefined,
    nextGeneration: () => ++generation,
    setRepeatActive: jest.fn(async () => true),
    setForwardingActive: jest.fn(async () => true),
  };
  return { bridge, emit: (event: BridgeEvent) => listener?.(event) };
}

describe('RemoteSession', () => {
  it('cleans repeat, drag, modifiers, and typing without real input', async () => {
    const calls: [string, unknown, string | undefined][] = [];
    const manager = { send: async (type: string, payload: unknown, mode?: string) => { calls.push([type, payload, mode]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile(), () => 'stream-1');
    await session.toggleDrag();
    await session.toggleModifier('Shift');
    await session.streamChunk('safe fixture');
    await session.cleanup();
    expect(calls.map(([type]) => type)).toEqual(['mouse.dragStart', 'keyboard.modifierDown', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'mouse.dragEnd', 'keyboard.modifierUp', 'keyboard.textStream.close']);
    expect(session.snapshot()).toEqual({ repeat: null, dragging: false, modifiers: [], streamOpen: false });
  });

  it('uses the desktop-compatible PC-side repeat payload and the next control stops it', async () => {
    const calls: [string, unknown][] = [];
    const manager = { send: async (type: string, payload: unknown) => { calls.push([type, payload]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    await session.mouse('mouse.click');
    expect(calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'mouse.move', payload: { dx: 10, dy: 0 } } }],
      ['mouse.repeat.stop', {}],
    ]);
  });

  it('publishes acknowledged repeat state and stops for the matching Switchify request', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const host = fakeBridge();
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge);
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    expect(host.bridge.setRepeatActive).toHaveBeenCalledWith(101, true);
    host.emit({ type: 'repeatStop', generation: 100 });
    await Promise.resolve();
    expect(session.snapshot().repeat).toBe('mouse.move');
    host.emit({ type: 'repeatStop', generation: 101 });
    await Promise.resolve(); await Promise.resolve();
    expect(session.snapshot().repeat).toBeNull();
    expect(host.bridge.setRepeatActive).toHaveBeenLastCalledWith(101, false);
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);
  });

  it('re-arms an active repeat when the Switchify bridge recovers', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const host = fakeBridge();
    (host.bridge.setRepeatActive as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge);

    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    expect(host.bridge.setRepeatActive).toHaveBeenCalledWith(101, true);
    expect(session.snapshot().repeat).toBe('mouse.move');

    host.emit({ type: 'snapshot', version: 0, captureAvailable: false, externalSwitches: [] });
    host.emit({ type: 'snapshot', version: 1, captureAvailable: true, externalSwitches: [{ keyCode: 131, name: 'a' }] });
    await Promise.resolve(); await Promise.resolve();
    expect(host.bridge.setRepeatActive).toHaveBeenCalledWith(102, true);

    host.emit({ type: 'repeatStop', generation: 101 });
    await Promise.resolve();
    expect(session.snapshot().repeat).toBe('mouse.move');
    host.emit({ type: 'repeatStop', generation: 102 });
    await Promise.resolve(); await Promise.resolve();
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);
  });

  it('serializes stream open and monotonically advances sequence numbers', async () => {
    const calls: { type: string; payload: unknown }[] = [];
    let releaseOpen!: () => void;
    const open = new Promise<void>((resolve) => { releaseOpen = resolve; });
    const manager = { send: async (type: string, payload: unknown) => { calls.push({ type, payload }); if (type === 'keyboard.textStream.open') await open; return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile(), () => 'stream-1');
    const first = session.streamChunk('a');
    const second = session.streamChunk('b');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(calls.map(({ type }) => type)).toEqual(['keyboard.textStream.open']);
    releaseOpen();
    await Promise.all([first, second]);
    expect(calls.map(({ type }) => type)).toEqual(['keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.chunk']);
    expect(calls.slice(1).map(({ payload }) => (payload as { seq: number }).seq)).toEqual([0, 1]);
  });

  it('never sends capabilities the PC did not advertise', async () => {
    const send = jest.fn(async () => true);
    const session = new RemoteSession({ send } as unknown as ConnectionManager, profile(['mouse.move']));
    expect(await session.command('mouse.click')).toBe(false);
    expect(await session.streamChunk('not sent')).toBe(false);
    expect(await session.mouse('mouse.move', { dx: 1, dy: 0 })).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('uses safe disabled defaults when profile negotiation is unavailable', async () => {
    const send = jest.fn(async () => true);
    const session = new RemoteSession({ send } as unknown as ConnectionManager, null);
    expect(session.supports('mouse.move')).toBe(false);
    expect(await session.command('mouse.click')).toBe(false);
    expect(await session.streamKey('Enter')).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('releases and clears active modifiers after a successful shortcut only', async () => {
    const calls: string[] = [];
    let shortcutSucceeds = false;
    const manager = { send: async (type: string) => { calls.push(type); return type !== 'keyboard.shortcut' || shortcutSucceeds; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.toggleModifier('Ctrl');
    expect(await session.shortcut('C')).toBe(false);
    expect(session.snapshot().modifiers).toEqual(['Ctrl']);
    shortcutSucceeds = true;
    expect(await session.shortcut('C')).toBe(true);
    expect(session.snapshot().modifiers).toEqual([]);
    expect(calls).toEqual(['keyboard.modifierDown', 'keyboard.shortcut', 'keyboard.shortcut', 'keyboard.modifierUp']);
  });
});
