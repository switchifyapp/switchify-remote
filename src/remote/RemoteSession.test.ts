import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { RemoteSession } from './RemoteSession';
import type { BridgeEvent, BridgeSnapshot, SwitchifyBridge } from '@/bridge/types';

const allCommands = ['mouse.move', 'mouse.click', 'mouse.doubleClick', 'mouse.rightClick', 'mouse.scroll', 'mouse.dragStart', 'mouse.dragEnd', 'mouse.repeat.start', 'mouse.repeat.stop', 'pointer.speed.set', 'pointer.display.move', 'keyboard.key', 'keyboard.modifierDown', 'keyboard.modifierUp', 'keyboard.shortcut', 'keyboard.typeText', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close', 'window.control'];
const profile = (supportedCommands = allCommands): PointerProfile => ({ displayId: 'display', scaleFactor: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, maxDelta: 128, recommendedDeltas: { small: 32, medium: 64, large: 128 }, capabilities: { noAckCommands: [], noAckMouseMove: false, supportedCommands, mouseRepeat: { supported: true, enabled: true, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2000 }, keyRepeat: { supported: true, enabled: true, intervalMs: 250, initialDelayMs: 500, minIntervalMs: 100, maxIntervalMs: 1000, repeatableKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Delete', 'PageUp', 'PageDown'] }, pointerSpeed: { supported: true, setSupported: true, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 64, effectiveMoveDelta: 64 }, displayNavigation: { supported: true, displayCount: 2 } } });

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
    const calls: [string, unknown, string | undefined][] = [];
    const manager = { send: async (type: string, payload: unknown, responseMode?: string) => { calls.push([type, payload, responseMode]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    await session.mouse('mouse.click');
    expect(calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'mouse.move', payload: { dx: 10, dy: 0 } } }, undefined],
      ['mouse.repeat.stop', {}, 'ack'],
    ]);
  });

  it('repeats an allowlisted key and stops it on the next control', async () => {
    const calls: [string, unknown, string | undefined][] = [];
    const manager = { send: async (type: string, payload: unknown, responseMode?: string) => { calls.push([type, payload, responseMode]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.key('ArrowDown');
    expect(session.snapshot().repeat).toBe('keyboard.key');
    await session.key('ArrowDown');
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'keyboard.key', payload: { key: 'ArrowDown' } } }, undefined],
      ['mouse.repeat.stop', {}, 'ack'],
    ]);
  });

  it.each([false, true])('clears key repeat before changing a modifier, initially held: %s', async (held) => {
    const send = jest.fn(async () => true);
    const host = fakeBridge();
    const session = new RemoteSession({ send } as unknown as ConnectionManager, profile(), undefined, null, host.bridge);
    if (held) await session.toggleModifier('Shift');
    await session.key('ArrowDown');
    send.mockClear();

    await session.toggleModifier('Shift');
    expect(session.snapshot().repeat).toBeNull();
    expect(session.snapshot().modifiers).toEqual(held ? [] : ['Shift']);
    expect(host.bridge.setRepeatActive).toHaveBeenLastCalledWith(101, false);
    await session.key('ArrowDown');
    expect(send.mock.calls).toEqual([
      ['mouse.repeat.stop', {}, 'ack'],
      [held ? 'keyboard.modifierUp' : 'keyboard.modifierDown', { key: 'Shift' }, 'ack'],
      ['mouse.repeat.start', { command: { type: 'keyboard.key', payload: { key: 'ArrowDown' } } }],
    ]);
    await session.cleanup();
    session.dispose();
  });

  it('orders a modifier change between a pending repeat start and the next key', async () => {
    let acknowledgeStart!: (ok: boolean) => void;
    const pendingStart = new Promise<boolean>((resolve) => { acknowledgeStart = resolve; });
    const send = jest.fn(async (_type: string, _payload: unknown, _mode?: string) => true)
      .mockImplementationOnce(() => pendingStart);
    const host = fakeBridge();
    const session = new RemoteSession({ send } as unknown as ConnectionManager, profile(), undefined, null, host.bridge);
    const starting = session.key('ArrowDown');
    const modifier = session.toggleModifier('Shift');
    const next = session.key('ArrowDown');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(send).toHaveBeenCalledTimes(1);

    acknowledgeStart(true);
    await Promise.all([starting, modifier, next]);
    expect(send.mock.calls.map(([type]) => type)).toEqual([
      'mouse.repeat.start', 'mouse.repeat.stop', 'keyboard.modifierDown', 'mouse.repeat.start',
    ]);
    expect(session.snapshot().modifiers).toEqual(['Shift']);
    expect((host.bridge.setRepeatActive as jest.Mock).mock.calls).toEqual([[101, true], [101, false], [102, true]]);
    await session.cleanup();
    session.dispose();
  });

  it('falls back to a single key press when the desktop cannot repeat that key', async () => {
    const base = profile();
    const cases: [string, PointerProfile, string][] = [
      // An older desktop advertises no keyRepeat block at all.
      ['capability absent', { ...base, capabilities: { ...base.capabilities, keyRepeat: { supported: false, enabled: false, intervalMs: 250, initialDelayMs: 500, minIntervalMs: 100, maxIntervalMs: 1000, repeatableKeys: [] } } }, 'ArrowDown'],
      ['repeat disabled in desktop settings', { ...base, capabilities: { ...base.capabilities, keyRepeat: { ...base.capabilities.keyRepeat, enabled: false } } }, 'ArrowDown'],
      ['key outside the allowlist', base, 'Enter'],
    ];
    for (const [name, used, key] of cases) {
      const calls: [string, unknown][] = [];
      const manager = { send: async (type: string, payload: unknown) => { calls.push([type, payload]); return true; } } as unknown as ConnectionManager;
      const session = new RemoteSession(manager, used);
      await session.key(key);
      expect([name, calls]).toEqual([name, [['keyboard.key', { key }]]]);
      expect([name, session.snapshot().repeat]).toEqual([name, null]);
    }
  });

  it('delivers a non-repeatable key that stops an active repeat instead of dropping it', async () => {
    const calls: [string, unknown][] = [];
    const manager = { send: async (type: string, payload: unknown) => { calls.push([type, payload]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.key('ArrowDown');
    // Escape cannot repeat, so it is not a toggle: the repeat stops and the key
    // must still reach the desktop, or the user pays a second activation.
    await session.key('Escape');
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'keyboard.key', payload: { key: 'ArrowDown' } } }],
      ['mouse.repeat.stop', {}],
      ['keyboard.key', { key: 'Escape' }],
    ]);
  });

  it('delivers a key pressed during a pointer repeat on a desktop that cannot repeat keys', async () => {
    const base = profile();
    const withoutKeyRepeat: PointerProfile = { ...base, capabilities: { ...base.capabilities, keyRepeat: { ...base.capabilities.keyRepeat, supported: false, enabled: false, repeatableKeys: [] } } };
    const calls: [string, unknown][] = [];
    const manager = { send: async (type: string, payload: unknown) => { calls.push([type, payload]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, withoutKeyRepeat);
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    await session.key('ArrowDown');
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'mouse.move', payload: { dx: 10, dy: 0 } } }],
      ['mouse.repeat.stop', {}],
      ['keyboard.key', { key: 'ArrowDown' }],
    ]);
  });

  it('refuses to repeat a key the desktop advertises but this client will not repeat', async () => {
    const base = profile();
    const hostile: PointerProfile = { ...base, capabilities: { ...base.capabilities, keyRepeat: { ...base.capabilities.keyRepeat, repeatableKeys: ['Enter', 'a', 'Escape', 'ArrowDown'] } } };
    const calls: [string, unknown][] = [];
    const manager = { send: async (type: string, payload: unknown) => { calls.push([type, payload]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, hostile);
    // Repeating Enter would re-submit on every tick, so the advertised list is
    // intersected with what this client is willing to repeat.
    for (const key of ['Enter', 'a', 'Escape']) {
      await session.key(key);
      expect([key, session.snapshot().repeat]).toEqual([key, null]);
    }
    expect(calls).toEqual([
      ['keyboard.key', { key: 'Enter' }],
      ['keyboard.key', { key: 'a' }],
      ['keyboard.key', { key: 'Escape' }],
    ]);
    // A key on both lists still repeats.
    await session.key('ArrowDown');
    expect(session.snapshot().repeat).toBe('keyboard.key');
  });

  it('falls back to a single key press when the desktop lacks the repeat commands', async () => {
    const calls: [string, unknown][] = [];
    const manager = { send: async (type: string, payload: unknown) => { calls.push([type, payload]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile(allCommands.filter((type) => !type.startsWith('mouse.repeat.'))));
    await session.key('ArrowDown');
    expect(calls).toEqual([['keyboard.key', { key: 'ArrowDown' }]]);
  });

  it('does not send a key the desktop does not support at all', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile(allCommands.filter((type) => type !== 'keyboard.key')));
    expect(await session.key('ArrowDown')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('stops a repeating key for a physical switch and on cleanup', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const host = fakeBridge();
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge);
    await session.key('Backspace');
    expect(host.bridge.setRepeatActive).toHaveBeenCalledWith(101, true);
    host.emit({ type: 'repeatStop', generation: 101 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);

    await session.key('Tab');
    await session.cleanup();
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop', 'mouse.repeat.start', 'mouse.repeat.stop']);
  });

  it('stops a pointer repeat with a key press and still delivers that key', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    // The pointer repeat is not this key's own repeat, so the key is delivered
    // rather than swallowed as a toggle.
    await session.key('ArrowDown');
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop', 'keyboard.key']);

    // A key repeat is stopped by any following control, as before.
    await session.key('ArrowDown');
    await session.mouse('mouse.click');
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop', 'keyboard.key', 'mouse.repeat.start', 'mouse.repeat.stop']);
  });

  it('treats only the repeating key itself as the toggle that stops it', async () => {
    const calls: [string, unknown][] = [];
    const manager = { send: async (type: string, payload: unknown) => { calls.push([type, payload]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.key('ArrowDown');
    // A different repeatable key stops the repeat and is still delivered.
    await session.key('ArrowUp');
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'keyboard.key', payload: { key: 'ArrowDown' } } }],
      ['mouse.repeat.stop', {}],
      ['keyboard.key', { key: 'ArrowUp' }],
    ]);
  });

  it('publishes acknowledged repeat state and stops for the matching Switchify request', async () => {
    const calls: [string, string | undefined][] = [];
    const manager = { send: async (type: string, _payload: unknown, responseMode?: string) => { calls.push([type, responseMode]); return true; } } as unknown as ConnectionManager;
    const host = fakeBridge();
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge);
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    expect(host.bridge.setRepeatActive).toHaveBeenCalledWith(101, true);
    host.emit({ type: 'repeatStop', generation: 100 });
    await Promise.resolve();
    expect(session.snapshot().repeat).toBe('mouse.move');
    host.emit({ type: 'repeatStop', generation: 101 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.snapshot().repeat).toBeNull();
    expect(host.bridge.setRepeatActive).toHaveBeenLastCalledWith(101, false);
    expect(calls).toEqual([
      ['mouse.repeat.start', undefined],
      ['mouse.repeat.stop', 'ack'],
    ]);
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);
  });

  it('orders a new repeat start after physical-switch stop cleanup', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const host = fakeBridge();
    let releaseDeactivation!: () => void;
    const deactivation = new Promise<void>((resolve) => { releaseDeactivation = resolve; });
    (host.bridge.setRepeatActive as jest.Mock).mockImplementation(async (_generation: number, active: boolean) => {
      if (!active) await deactivation;
      return true;
    });
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge);
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);

    host.emit({ type: 'repeatStop', generation: 101 });
    await Promise.resolve(); await Promise.resolve();
    const next = session.mouse('mouse.move', { dx: -10, dy: 0 }, true);
    await Promise.resolve(); await Promise.resolve();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);

    releaseDeactivation();
    await next;
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop', 'mouse.repeat.start']);
    expect(session.snapshot().repeat).toBe('mouse.move');
    expect(host.bridge.setRepeatActive).toHaveBeenLastCalledWith(102, true);
  });

  it('clears repeat immediately while bridge activation is pending and stops the PC before bridge cleanup', async () => {
    const order: string[] = [];
    let releaseActivation!: () => void;
    const activation = new Promise<void>((resolve) => { releaseActivation = resolve; });
    const host = fakeBridge();
    (host.bridge.setRepeatActive as jest.Mock).mockImplementation(async (_generation: number, active: boolean) => {
      order.push(active ? 'bridge:on' : 'bridge:off');
      if (active) await activation;
      return true;
    });
    const manager = { send: async (type: string) => { order.push(type); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge);
    const starting = session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.snapshot().repeat).toBe('mouse.move');

    const stopping = session.stopRepeat();
    const duplicate = session.stopRepeat();
    expect(session.snapshot().repeat).toBeNull();
    expect(order).toEqual(['mouse.repeat.start', 'bridge:on']);

    releaseActivation();
    await Promise.all([starting, stopping, duplicate]);
    expect(order).toEqual(['mouse.repeat.start', 'bridge:on', 'mouse.repeat.stop', 'bridge:off']);
  });

  it('does not let a hung bridge activation block repeat cleanup', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const host = fakeBridge();
    (host.bridge.setRepeatActive as jest.Mock).mockImplementation(() => new Promise<boolean>(() => undefined));
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge, 1);

    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    await session.cleanup();

    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);
  });

  it('sends the PC stop before bridge deactivation and does not let deactivation block cleanup', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const host = fakeBridge();
    (host.bridge.setRepeatActive as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => new Promise<boolean>(() => undefined));
    const session = new RemoteSession(manager, profile(), undefined, null, host.bridge, 1);

    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    const cleanup = session.cleanup();
    await Promise.resolve(); await Promise.resolve();

    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);
    await cleanup;
  });

  it('uses an acknowledged repeat stop during lifecycle cleanup', async () => {
    const calls: [string, string | undefined][] = [];
    const manager = { send: async (type: string, _payload: unknown, responseMode?: string) => {
      calls.push([type, responseMode]);
      return true;
    } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());

    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    await session.cleanup();

    expect(calls).toEqual([
      ['mouse.repeat.start', undefined],
      ['mouse.repeat.stop', 'ack'],
    ]);
  });

  it('stops the old session with acknowledgement before a replacement starts repeating', async () => {
    const calls: [string, string | undefined][] = [];
    const manager = { send: async (type: string, _payload: unknown, responseMode?: string) => {
      calls.push([type, responseMode]);
      return true;
    } } as unknown as ConnectionManager;
    const oldSession = new RemoteSession(manager, profile(), undefined, 'pc-1');
    await oldSession.mouse('mouse.move', { dx: 10, dy: 0 }, true);

    const replacement = new RemoteSession(manager, profile(), undefined, 'pc-2');
    await oldSession.cleanup();
    await replacement.mouse('mouse.move', { dx: -10, dy: 0 }, true);

    expect(calls).toEqual([
      ['mouse.repeat.start', undefined],
      ['mouse.repeat.stop', 'ack'],
      ['mouse.repeat.start', undefined],
    ]);
    expect(oldSession.snapshot().repeat).toBeNull();
    expect(replacement.snapshot().repeat).toBe('mouse.move');
    oldSession.dispose();
    replacement.dispose();
  });

  it('clears repeat once and keeps it cleared when the stop acknowledgement is missing', async () => {
    let finishStop!: (sent: boolean) => void;
    const stopResult = new Promise<boolean>((resolve) => { finishStop = resolve; });
    const calls: string[] = [];
    const manager = { send: (type: string) => {
      calls.push(type);
      return type === 'mouse.repeat.stop' ? stopResult : Promise.resolve(true);
    } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);

    const first = session.stopRepeat();
    const duplicate = session.stopRepeat();
    await Promise.resolve(); await Promise.resolve();
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);

    finishStop(false);
    await Promise.all([first, duplicate]);
    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);
  });

  it('keeps repeat cleared when the acknowledged stop reports a write failure', async () => {
    const calls: [string, string | undefined][] = [];
    const manager = { send: async (type: string, _payload: unknown, responseMode?: string) => {
      calls.push([type, responseMode]);
      return type !== 'mouse.repeat.stop';
    } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile());
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);

    await session.stopRepeat();

    expect(session.snapshot().repeat).toBeNull();
    expect(calls).toEqual([
      ['mouse.repeat.start', undefined],
      ['mouse.repeat.stop', 'ack'],
    ]);
  });

  it('serializes stream open and monotonically advances sequence numbers', async () => {
    const calls: { type: string; payload: unknown }[] = [];
    let releaseOpen!: () => void;
    const open = new Promise<void>((resolve) => { releaseOpen = resolve; });
    const manager = { send: async (type: string, payload: unknown) => { calls.push({ type, payload }); if (type === 'keyboard.textStream.open') await open; return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, profile(), () => 'stream-1');
    const first = session.streamChunk('a');
    const second = session.streamChunk('b');
    await new Promise((resolve) => setTimeout(resolve, 0));
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
