import { FIRST_RUN_SETUP_KEY, FirstRunSetupStore } from './FirstRunSetupStore';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    values,
  };
}

describe('FirstRunSetupStore', () => {
  it('shows setup when the versioned completion flag is missing, including when older app data exists', async () => {
    const persistence = storage({
      'switchify.remote.pairings': '{"saved":["existing-pc"]}',
    });
    const store = new FirstRunSetupStore(persistence);

    await store.load();

    expect(store.snapshot()).toBe('welcome');
    expect(persistence.getItem).toHaveBeenCalledWith(FIRST_RUN_SETUP_KEY);
  });

  it.each([
    'not json',
    'null',
    '{}',
    '{"version":2,"complete":true}',
    '{"version":1,"complete":false}',
  ])(
    'treats malformed or unsupported completion state as incomplete: %s',
    async (value) => {
      const store = new FirstRunSetupStore(
        storage({ [FIRST_RUN_SETUP_KEY]: value }),
      );
      await store.load();
      expect(store.snapshot()).toBe('welcome');
    },
  );

  it('restores a valid completed setup', async () => {
    const store = new FirstRunSetupStore(
      storage({ [FIRST_RUN_SETUP_KEY]: '{"version":1,"complete":true}' }),
    );
    await store.load();
    expect(store.snapshot()).toBe('complete');
  });

  it('moves between the two steps and persists completion under only the new key', async () => {
    const persistence = storage();
    const store = new FirstRunSetupStore(persistence);
    await store.load();

    store.showBluetooth();
    expect(store.snapshot()).toBe('bluetooth');
    store.showWelcome();
    expect(store.snapshot()).toBe('welcome');
    await store.complete();

    expect(store.snapshot()).toBe('complete');
    expect(persistence.setItem).toHaveBeenCalledWith(
      FIRST_RUN_SETUP_KEY,
      '{"version":1,"complete":true}',
    );
    expect([...persistence.values.keys()]).toEqual([FIRST_RUN_SETUP_KEY]);
  });

  it('does not complete setup when persistence fails', async () => {
    const persistence = storage();
    persistence.setItem.mockRejectedValueOnce(
      new Error('private storage failure'),
    );
    const store = new FirstRunSetupStore(persistence);
    await store.load();

    await expect(store.complete()).rejects.toThrow('private storage failure');
    expect(store.snapshot()).toBe('welcome');
  });
});
