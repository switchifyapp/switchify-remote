import { ReadResponsePoller } from './ReadResponsePoller';
import { parseStatus } from '@/domain/protocol/responses';

describe('Linux read responses', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('negotiates explicitly and preserves old desktops', () => {
    const base = { protocolVersion: 1, desktopId: 'pc', platform: 'linux' };
    expect(parseStatus(JSON.stringify(base))?.responseTransport).toBeUndefined();
    expect(parseStatus(JSON.stringify({ ...base, responseTransport: 'read-v1' }))?.responseTransport).toBe('read-v1');
    for (const responseTransport of ['future', null, true]) expect(parseStatus(JSON.stringify({ ...base, responseTransport }))).toBeNull();
  });

  it('polls serially, idles on empty values and stops without late delivery', async () => {
    let finish!: (value: string) => void;
    const read = jest.fn().mockResolvedValueOnce('').mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    const cancel = jest.fn(async () => undefined), frame = jest.fn(), error = jest.fn();
    const poller = new ReadResponsePoller(read, cancel, frame, error, 1000);
    await poller.ready;
    await jest.advanceTimersByTimeAsync(99);
    expect(read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(401);
    expect(read).toHaveBeenCalledTimes(2);
    poller.stop();
    finish('e30=');
    await jest.advanceTimersByTimeAsync(2000);
    expect(frame).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('delivers nonempty frames without the idle delay', async () => {
    const read = jest.fn().mockResolvedValueOnce('e30=').mockResolvedValue('');
    const frame = jest.fn();
    const poller = new ReadResponsePoller(read, async () => undefined, frame, jest.fn(), 1000);
    await poller.ready;
    expect(frame).toHaveBeenCalledWith('e30=');
    await jest.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it.each([null, '!', 'x'.repeat(244)])('fails closed on malformed or oversized value', async (value) => {
    const error = jest.fn();
    const poller = new ReadResponsePoller(async () => value, async () => undefined, jest.fn(), error, 1000);
    await expect(poller.ready).rejects.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('times out once, cancels the native read and ignores its late completion', async () => {
    let finish!: (value: string) => void;
    const cancel = jest.fn(async () => undefined), frame = jest.fn(), error = jest.fn();
    const poller = new ReadResponsePoller(() => new Promise((resolve) => { finish = resolve; }), cancel, frame, error, 1000);
    const rejected = expect(poller.ready).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(1000);
    await rejected;
    finish('e30=');
    await jest.advanceTimersByTimeAsync(2000);
    expect(error).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(frame).not.toHaveBeenCalled();
  });
});
