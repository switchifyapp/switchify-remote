import AsyncStorage from '@react-native-async-storage/async-storage';

import { PreferencesStore } from './PreferencesStore';

const KEY = 'switchify.remote.preferences.v1';

describe('PreferencesStore Remote name', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('migrates existing preferences to the automatic model name', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ surface: 'typing', typingMode: 'draft' }));
    const store = new PreferencesStore();
    await store.load();
    expect(store.snapshot()).toMatchObject({ surface: 'typing', typingMode: 'draft', remoteName: null });
  });

  it('loads once when callers race during startup', async () => {
    const read = AsyncStorage.getItem as jest.Mock;
    read.mockClear();
    const store = new PreferencesStore();
    await Promise.all([store.load(), store.load(), store.load()]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('trims and persists a custom name, then resets to the device model', async () => {
    const store = new PreferencesStore();
    await store.load();
    await store.update({ remoteName: '  Kitchen Remote  ' });
    expect(store.snapshot().remoteName).toBe('Kitchen Remote');
    expect(JSON.parse(await AsyncStorage.getItem(KEY) ?? '{}')).toMatchObject({ remoteName: 'Kitchen Remote' });
    await store.update({ remoteName: null });
    expect(store.snapshot().remoteName).toBeNull();
  });

  it('loads existing preferences before an early name update', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ surface: 'window' }));
    const store = new PreferencesStore();
    await store.update({ remoteName: 'Office Remote' });
    expect(store.snapshot()).toMatchObject({ surface: 'window', remoteName: 'Office Remote' });
  });

  it('rejects invalid custom names without changing storage', async () => {
    const store = new PreferencesStore();
    await store.load();
    await expect(store.update({ remoteName: 'Phone\nSpoof' })).rejects.toThrow('control characters');
    expect(store.snapshot().remoteName).toBeNull();
  });

  it('discards an invalid name from stored legacy data', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ remoteName: 'x'.repeat(41) }));
    const store = new PreferencesStore();
    await store.load();
    expect(store.snapshot().remoteName).toBeNull();
  });
});
