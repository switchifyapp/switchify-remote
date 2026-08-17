import { LiveTypingController } from './LiveTypingController';

describe('LiveTypingController', () => {
  it('serializes rapid desired-text updates', async () => {
    const chunks: string[] = [];
    let releaseFirst!: (value: boolean) => void;
    const first = new Promise<boolean>((resolve) => { releaseFirst = resolve; });
    const session = { streamChunk: jest.fn(async (text: string) => { chunks.push(text); return chunks.length === 1 ? first : true; }), streamKey: jest.fn(async () => true) };
    const controller = new LiveTypingController(session);
    const one = controller.update('a');
    await Promise.resolve();
    const two = controller.update('ab');
    releaseFirst(true);
    await Promise.all([one, two]);
    expect(chunks.join('')).toBe('ab');
    expect(controller.applied()).toBe('ab');
  });

  it('uses Unicode code points for deletion and supports IME replacement', async () => {
    const calls: string[] = [];
    const session = { streamChunk: async (text: string) => { calls.push(`chunk:${text}`); return true; }, streamKey: async (key: string) => { calls.push(`key:${key}`); return true; } };
    const controller = new LiveTypingController(session);
    await controller.update('🙂');
    await controller.update('');
    await controller.update('cafe');
    await controller.update('café');
    expect(calls).toEqual(['chunk:🙂', 'key:Backspace', 'chunk:cafe', 'key:Backspace', 'chunk:é']);
  });

  it('preserves unapplied text for a retry after failure', async () => {
    let attempt = 0;
    const session = { streamChunk: async () => { attempt += 1; return attempt > 1; }, streamKey: async () => true };
    const controller = new LiveTypingController(session);
    expect(await controller.update('unsent')).toBe(false);
    expect(controller.applied()).toBe('');
    expect(await controller.update('unsent')).toBe(true);
    expect(controller.applied()).toBe('unsent');
  });
});
