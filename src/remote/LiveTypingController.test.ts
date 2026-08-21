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

  it('reconciles pending text before Enter and resets the baseline after success', async () => {
    const calls: string[] = [];
    let releaseChunk!: (value: boolean) => void;
    const pendingChunk = new Promise<boolean>((resolve) => { releaseChunk = resolve; });
    const session = {
      streamChunk: jest.fn(async (text: string) => {
        calls.push(`chunk:${text}`);
        return text === 'first' ? pendingChunk : true;
      }),
      streamKey: jest.fn(async (key: string) => { calls.push(`key:${key}`); return true; }),
    };
    const controller = new LiveTypingController(session);

    const update = controller.update('first');
    const submit = controller.submitLine();
    releaseChunk(true);

    await expect(Promise.all([update, submit])).resolves.toEqual([true, true]);
    expect(calls).toEqual(['chunk:first', 'key:Enter']);
    expect(controller.applied()).toBe('');

    await expect(controller.update('second')).resolves.toBe(true);
    expect(calls).toEqual(['chunk:first', 'key:Enter', 'chunk:second']);
    expect(session.streamKey).not.toHaveBeenCalledWith('Backspace');
  });

  it('retries failed reconciliation before sending Enter', async () => {
    const calls: string[] = [];
    let chunkAttempt = 0;
    const session = {
      streamChunk: jest.fn(async (text: string) => {
        calls.push(`chunk:${text}`);
        chunkAttempt += 1;
        return chunkAttempt > 1;
      }),
      streamKey: jest.fn(async (key: string) => { calls.push(`key:${key}`); return true; }),
    };
    const controller = new LiveTypingController(session);

    expect(await controller.update('retry me')).toBe(false);
    expect(await controller.submitLine()).toBe(true);
    expect(calls).toEqual(['chunk:retry me', 'chunk:retry me', 'key:Enter']);
    expect(controller.applied()).toBe('');
  });

  it('keeps the baseline when Enter fails so Retry Enter sends no duplicate text', async () => {
    const calls: string[] = [];
    let enterAttempt = 0;
    const session = {
      streamChunk: jest.fn(async (text: string) => { calls.push(`chunk:${text}`); return true; }),
      streamKey: jest.fn(async (key: string) => {
        calls.push(`key:${key}`);
        enterAttempt += 1;
        return enterAttempt > 1;
      }),
    };
    const controller = new LiveTypingController(session);

    await controller.update('kept');
    expect(await controller.submitLine()).toBe(false);
    expect(controller.applied()).toBe('kept');
    expect(await controller.submitLine()).toBe(true);
    expect(calls).toEqual(['chunk:kept', 'key:Enter', 'key:Enter']);
    expect(controller.applied()).toBe('');
  });
});
