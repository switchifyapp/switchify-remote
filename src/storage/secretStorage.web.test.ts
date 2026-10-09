/** @jest-environment jsdom */
const builtin = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule;
const { webcrypto } = builtin('node:crypto') as { webcrypto: Crypto };
const nodeText = builtin('node:util') as { TextEncoder: typeof TextEncoder; TextDecoder: typeof TextDecoder };

Object.assign(globalThis, { TextEncoder: nodeText.TextEncoder, TextDecoder: nodeText.TextDecoder });

type Request<T> = { result: T; error: Error | null; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded?: (() => void) | null };

class FakeIndexedDb {
  stores = new Map<string, Map<string, unknown>>();
  failOpen = false;
  abortCommit = false;
  addGate: Promise<void> | null = null;
  open(): Request<unknown> {
    const request: Request<unknown> = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => {
      if (this.failOpen) { request.error = new Error('blocked'); request.onerror?.(); return; }
      const database = {
        createObjectStore: (name: string) => { this.stores.set(name, new Map()); },
        transaction: (name: string) => {
          const transaction: { oncomplete: (() => void) | null; onabort: (() => void) | null; onerror: (() => void) | null; error: Error | null; objectStore: () => unknown } = {
            oncomplete: null, onabort: null, onerror: null, error: null,
            objectStore: () => this.#store(name, (failed) => setTimeout(() => {
              if (failed || this.abortCommit) { transaction.error = new Error('aborted'); transaction.onabort?.(); }
              else transaction.oncomplete?.();
            }, 0)),
          };
          return transaction;
        },
        close: () => undefined,
      };
      request.result = database;
      if (!this.stores.has('keys')) request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request;
  }
  #store(name: string, settled: (failed: boolean) => void) {
    const store = this.stores.get(name)!;
    const respond = <T>(action: () => T, gate: Promise<void> | null = null): Request<T | undefined> => {
      const request: Request<T | undefined> = { result: undefined, error: null, onsuccess: null, onerror: null };
      void Promise.resolve(gate).then(() => setTimeout(() => {
        try { request.result = action(); request.onsuccess?.(); settled(false); }
        catch (error) { request.error = error as Error; request.onerror?.(); settled(true); }
      }, 0));
      return request;
    };
    return {
      get: (key: string) => respond(() => store.get(key)),
      add: (value: unknown, key: string) => respond(() => {
        if (store.has(key)) throw Object.assign(new Error('exists'), { name: 'ConstraintError' });
        if (!this.abortCommit) store.set(key, value);
      }, this.addGate),
    };
  }
}

let indexedDb: FakeIndexedDb;

function load(): typeof import('./secretStorage.web') {
  let loaded!: typeof import('./secretStorage.web');
  jest.isolateModules(() => { loaded = jest.requireActual<typeof import('./secretStorage.web')>('./secretStorage.web'); });
  return loaded;
}

beforeEach(() => {
  indexedDb = new FakeIndexedDb();
  window.localStorage.clear();
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: indexedDb });
  Object.defineProperty(window, 'crypto', { configurable: true, value: webcrypto });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  let queue: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, 'locks', { configurable: true, value: {
    request: (_name: string, _options: unknown, callback: () => Promise<string>) => {
      const next = queue.catch(() => undefined).then(callback);
      queue = next;
      return next;
    },
  } });
});

describe('web secret storage', () => {
  it('creates one persistent identity across independent browser instances', async () => {
    const first = load().secretStorage;
    const second = load().secretStorage;
    const createFirst = jest.fn(() => 'remote-one');
    const createSecond = jest.fn(() => 'remote-two');
    const identities = await Promise.all([
      first.getOrCreateItemAsync!('device-id', createFirst),
      second.getOrCreateItemAsync!('device-id', createSecond),
    ]);
    expect(identities[0]).toBe(identities[1]);
    expect(createFirst.mock.calls.length + createSecond.mock.calls.length).toBe(1);
    expect(await load().secretStorage.getItemAsync('device-id')).toBe(identities[0]);
    expect(Object.values({ ...window.localStorage }).join(' ')).not.toContain(identities[0]);
  });

  it('preserves an existing identity without requiring a lock', async () => {
    const storage = load().secretStorage;
    await storage.setItemAsync('device-id', 'existing');
    Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });
    const create = jest.fn(() => 'replacement');
    expect(await storage.getOrCreateItemAsync!('device-id', create)).toBe('existing');
    expect(create).not.toHaveBeenCalled();
  });

  it('fails safely without cross-tab locks rather than racing a new identity', async () => {
    Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });
    const storage = load().secretStorage;
    const create = jest.fn(() => 'unsafe');
    await expect(storage.getOrCreateItemAsync!('device-id', create)).rejects.toThrow('unavailable');
    expect(create).not.toHaveBeenCalled();
    expect(await storage.getItemAsync('device-id')).toBeNull();
  });

  it('bounds waiting for a lock held by another tab', async () => {
    jest.useFakeTimers();
    try {
      Object.defineProperty(window.navigator, 'locks', { configurable: true, value: {
        request: (_name: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('lock aborted')));
        }),
      } });
      const create = jest.fn(() => 'late');
      const pending = load().secretStorage.getOrCreateItemAsync!('device-id', create);
      const rejected = expect(pending).rejects.toThrow('unavailable');
      await jest.advanceTimersByTimeAsync(5_000);
      await rejected;
      expect(create).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('does not return an identity when persistence fails', async () => {
    indexedDb.abortCommit = true;
    await expect(load().secretStorage.getOrCreateItemAsync!('device-id', () => 'unsaved')).rejects.toThrow('unavailable');
    expect(window.localStorage.length).toBe(0);
  });

  it('round-trips a secret without storing it in plain text', async () => {
    const { secretStorage } = load();
    await secretStorage.setItemAsync('switchify.remote.token.pc-1', 'secret-token');
    const stored = Object.values({ ...window.localStorage }).join(' ');
    expect(stored).not.toContain('secret-token');
    expect(await secretStorage.getItemAsync('switchify.remote.token.pc-1')).toBe('secret-token');
    await secretStorage.deleteItemAsync('switchify.remote.token.pc-1');
    expect(await secretStorage.getItemAsync('switchify.remote.token.pc-1')).toBeNull();
  });

  it('reports a key that cannot be loaded as an error, not as a missing secret', async () => {
    await load().secretStorage.setItemAsync('token', 'secret-token');
    indexedDb.failOpen = true;
    await expect(load().secretStorage.getItemAsync('token')).rejects.toThrow();
  });

  it('treats a value that fails authentication as absent', async () => {
    const { secretStorage } = load();
    await secretStorage.setItemAsync('token', 'secret-token');
    const key = 'switchify.remote.secret.v1.token';
    const [iv, data] = window.localStorage.getItem(key)!.split('.');
    window.localStorage.setItem(key, `${iv}.${data!.slice(0, -4)}AAA=`);
    expect(await secretStorage.getItemAsync('token')).toBeNull();
    window.localStorage.setItem('switchify.remote.secret.v1.moved', window.localStorage.getItem(key)!);
    expect(await secretStorage.getItemAsync('moved')).toBeNull();
  });

  it('shares one key when two tabs create it at the same time', async () => {
    let release!: () => void;
    indexedDb.addGate = new Promise((resolve) => { release = resolve; });
    const first = load().secretStorage;
    const second = load().secretStorage;
    const writes = Promise.all([first.setItemAsync('a', 'one'), second.setItemAsync('b', 'two')]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await writes;
    const reader = load().secretStorage;
    expect(await reader.getItemAsync('a')).toBe('one');
    expect(await reader.getItemAsync('b')).toBe('two');
  });

  it('does not use a key whose save was aborted', async () => {
    indexedDb.abortCommit = true;
    await expect(load().secretStorage.setItemAsync('token', 'secret-token')).rejects.toThrow();
    expect(window.localStorage.getItem('switchify.remote.secret.v1.token')).toBeNull();
  });

  it('refuses to run outside a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    await expect(load().secretStorage.getItemAsync('token')).rejects.toThrow('unavailable');
  });
});
