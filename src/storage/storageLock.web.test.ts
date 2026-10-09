/** @jest-environment jsdom */
import { withStorageLock } from './storageLock.web';

describe('web storage lock', () => {
  afterEach(() => { Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }); });

  it('runs the operation under an exclusive, bounded cross-tab lock', async () => {
    const request = jest.fn(async (_name: string, _options: { mode: string; signal: AbortSignal }, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    await expect(withStorageLock('pairings', async () => 'saved')).resolves.toBe('saved');
    expect(request).toHaveBeenCalledWith('switchify.remote.pairings', expect.objectContaining({ mode: 'exclusive', signal: expect.any(AbortSignal) }), expect.any(Function));
  });

  it('refuses to change shared pairings without cross-tab locks', async () => {
    const operation = jest.fn(async () => 'saved');
    await expect(withStorageLock('pairings', operation)).rejects.toThrow('unavailable');
    expect(operation).not.toHaveBeenCalled();
  });
});
