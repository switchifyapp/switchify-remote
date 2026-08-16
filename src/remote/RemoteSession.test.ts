import type { ConnectionManager } from '@/connection/ConnectionManager';
import { RemoteSession } from './RemoteSession';

describe('RemoteSession', () => {
  it('cleans repeat, drag, modifiers, and typing without real input', async () => {
    const calls: [string, unknown, string][] = [];
    const manager = { send: async (type: string, payload: unknown, mode: string) => { calls.push([type, payload, mode]); return true; } } as unknown as ConnectionManager;
    const session = new RemoteSession(manager, null, () => 'stream-1');
    await session.toggleDrag();
    await session.toggleModifier('Shift');
    await session.streamChunk('safe fixture');
    await session.cleanup();
    expect(calls.map(([type]) => type)).toEqual(['mouse.dragStart', 'keyboard.modifierDown', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'mouse.dragEnd', 'keyboard.modifierUp', 'keyboard.textStream.close']);
    expect(session.snapshot()).toEqual({ repeat: null, dragging: false, modifiers: [], streamOpen: false });
  });

  it('uses PC-side repeat and the next control stops it', async () => {
    const calls: string[] = [];
    const manager = { send: async (type: string) => { calls.push(type); return true; } } as unknown as ConnectionManager;
    const profile = { maxDelta: 128, recommendedDeltas: { small: 32, medium: 64, large: 128 }, capabilities: { mouseRepeat: { supported: true, enabled: true }, noAckCommands: [], noAckMouseMove: false } } as unknown as RemoteSession['profile'];
    const session = new RemoteSession(manager, profile);
    await session.mouse('mouse.move', { dx: 10, dy: 0 }, true);
    await session.mouse('mouse.click');
    expect(calls).toEqual(['mouse.repeat.start', 'mouse.repeat.stop']);
  });
});
