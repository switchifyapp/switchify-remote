/** @jest-environment jsdom */
const builtin = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule;
const { webcrypto } = builtin('node:crypto') as { webcrypto: Crypto };
const nodeText = builtin('node:util') as { TextEncoder: typeof TextEncoder; TextDecoder: typeof TextDecoder };

Object.assign(globalThis, { TextEncoder: nodeText.TextEncoder, TextDecoder: nodeText.TextDecoder });

type Request<T> = { result: T; error: Error | null; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded?: (() => void) | null };

class FakeIndexedDb {
  stores = new Map<string, Map<string, unknown>>();
  failOpen = false;
  addGate: Promise<void> | null = null;
  open(): Request<unknown> {
    const request: Request<unknown> = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => {
      if (this.failOpen) { request.error = new Error('blocked'); request.onerror?.(); return; }
      const database = {
        createObjectStore: (name: string) => { this.stores.set(name, new Map()); },
        transaction: (name: string) => ({ objectStore: () => this.#store(name) }),
        close: () => undefined,
      };
      request.result = database;
      if (!this.stores.has('keys')) request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request;
  }
  #store(name: string) {
    const store = this.stores.get(name)!;
    const respond = <T>(action: () => T, gate: Promise<void> | null = null): Request<T | undefined> => {
      const request: Request<T | undefined> = { result: undefined, error: null, onsuccess: null, onerror: null };
      void Promise.resolve(gate).then(() => setTimeout(() => {
        try { request.result = action(); request.onsuccess?.(); }
        catch (error) { request.error = error as Error; request.onerror?.(); }
      }, 0));
      return request;
    };
    return {
      get: (key: string) => respond(() => store.get(key)),
      add: (value: unknown, key: string) => respond(() => {
        if (store.has(key)) throw Object.assign(new Error('exists'), { name: 'ConstraintError' });
        store.set(key, value);
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
});

describe('web secret storage', () => {
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

  it('refuses to run outside a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    await expect(load().secretStorage.getItemAsync('token')).rejects.toThrow('unavailable');
  });
});
