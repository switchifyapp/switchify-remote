import { PairingStore, type SavedPc } from './PairingStore';

const indexKey = 'switchify.remote.pairings.v1';
const tokenKey = 'switchify.remote.token.pc-1';

class PublicMemory {
  values = new Map<string, string>();
  failGet = 0;
  failSet = 0;
  failRemove = 0;
  getItem = async (key: string) => { if (this.failGet-- > 0) throw new Error('get failed'); return this.values.get(key) ?? null; };
  setItem = async (key: string, value: string) => { if (this.failSet-- > 0) throw new Error('set failed'); this.values.set(key, value); };
  removeItem = async (key: string) => { if (this.failRemove-- > 0) throw new Error('remove failed'); this.values.delete(key); };
}

class SecretMemory {
  values = new Map<string, string>();
  failGet = 0;
  failDelete = 0;
  getItemAsync = async (key: string) => { if (this.failGet-- > 0) throw new Error('secret get failed'); return this.values.get(key) ?? null; };
  setItemAsync = async (key: string, value: string) => { this.values.set(key, value); };
  deleteItemAsync = async (key: string) => { if (this.failDelete-- > 0) throw new Error('delete failed'); this.values.delete(key); };
}

const pc: SavedPc = { desktopId: 'pc-1', displayName: 'Office', platform: 'windows', peripheralId: 'ble-1', lastConnectedAt: 1 };

function fixture() {
  const publicStorage = new PublicMemory();
  const secretStorage = new SecretMemory();
  publicStorage.values.set(indexKey, JSON.stringify([pc]));
  publicStorage.values.set(`${indexKey}.default`, 'pc-1');
  secretStorage.values.set(tokenKey, 'secret');
  return { publicStorage, secretStorage, store: new PairingStore(publicStorage, secretStorage) };
}

describe('PairingStore transactions', () => {
  it('rolls back a token update when saving the public index fails', async () => {
    const { store, publicStorage } = fixture();
    publicStorage.failSet = 1;
    await expect(store.save({ ...pc, displayName: 'Renamed' }, 'replacement')).rejects.toThrow('set failed');
    expect(await store.token('pc-1')).toBe('secret');
    expect(await store.list()).toEqual([pc]);
  });

  it('deletes the secret before publishing an unpaired index', async () => {
    const { store, publicStorage, secretStorage } = fixture();
    await store.remove('pc-1');
    expect(secretStorage.values.has(tokenKey)).toBe(false);
    expect(await store.list()).toEqual([]);
    expect(publicStorage.values.has(`${indexKey}.default`)).toBe(false);
  });

  it('leaves public state intact when secret deletion fails', async () => {
    const { store, secretStorage } = fixture();
    secretStorage.failDelete = 1;
    await expect(store.remove('pc-1')).rejects.toThrow('delete failed');
    expect(await store.list()).toEqual([pc]);
    expect(await store.token('pc-1')).toBe('secret');
  });

  it('restores the token and index when public index persistence fails', async () => {
    const { store, publicStorage } = fixture();
    publicStorage.failSet = 1;
    await expect(store.remove('pc-1')).rejects.toThrow('set failed');
    expect(await store.list()).toEqual([pc]);
    expect(await store.token('pc-1')).toBe('secret');
  });

  it('rolls back the removal when clearing the default fails', async () => {
    const { store, publicStorage } = fixture();
    publicStorage.failRemove = 1;
    await expect(store.remove('pc-1')).rejects.toThrow('remove failed');
    expect(await store.list()).toEqual([pc]);
    expect(await store.token('pc-1')).toBe('secret');
    expect(await store.defaultDesktopId()).toBe('pc-1');
  });

  it('does not mutate a pairing when the public index cannot be read', async () => {
    const { store, publicStorage, secretStorage } = fixture();
    publicStorage.failGet = 1;
    await expect(store.save({ ...pc, displayName: 'Renamed' }, 'replacement')).rejects.toThrow('get failed');
    expect(secretStorage.values.get(tokenKey)).toBe('secret');
    expect(publicStorage.values.get(indexKey)).toBe(JSON.stringify([pc]));

    publicStorage.failGet = 1;
    await expect(store.remove('pc-1')).rejects.toThrow('get failed');
    expect(secretStorage.values.get(tokenKey)).toBe('secret');
    expect(publicStorage.values.get(indexKey)).toBe(JSON.stringify([pc]));
  });

  it('does not overwrite a malformed pairing index during a mutation', async () => {
    const { store, publicStorage, secretStorage } = fixture();
    publicStorage.values.set(indexKey, '{malformed');
    await expect(store.remove('pc-1')).rejects.toThrow();
    expect(publicStorage.values.get(indexKey)).toBe('{malformed');
    expect(secretStorage.values.get(tokenKey)).toBe('secret');
  });

  it('removes confirmed orphaned metadata and its default without deleting other pairings', async () => {
    const { store, publicStorage, secretStorage } = fixture();
    const second = { ...pc, desktopId: 'pc-2', displayName: 'Studio' };
    publicStorage.values.set(indexKey, JSON.stringify([pc, second]));
    secretStorage.values.set('switchify.remote.token.pc-2', 'second-secret');
    secretStorage.values.delete(tokenKey);

    expect(await store.list()).toEqual([second]);
    expect(JSON.parse(publicStorage.values.get(indexKey)!)).toEqual([second]);
    expect(publicStorage.values.has(`${indexKey}.default`)).toBe(false);
  });

  it('does not reconcile or delete metadata when secure token reads fail', async () => {
    const { store, publicStorage, secretStorage } = fixture();
    secretStorage.failGet = 1;

    expect(await store.list()).toEqual([]);
    expect(publicStorage.values.get(indexKey)).toBe(JSON.stringify([pc]));
    expect(publicStorage.values.get(`${indexKey}.default`)).toBe('pc-1');
    expect(secretStorage.values.get(tokenKey)).toBe('secret');
  });

  it('rolls back orphan reconciliation when the default cannot be cleared', async () => {
    const { store, publicStorage, secretStorage } = fixture();
    secretStorage.values.delete(tokenKey);
    publicStorage.failRemove = 1;

    expect(await store.list()).toEqual([]);
    expect(publicStorage.values.get(indexKey)).toBe(JSON.stringify([pc]));
    expect(publicStorage.values.get(`${indexKey}.default`)).toBe('pc-1');
  });
});
