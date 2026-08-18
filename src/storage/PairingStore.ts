import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { PcPlatform } from '@/domain/protocol/types';

const INDEX_KEY = 'switchify.remote.pairings.v1';
const DEVICE_ID_KEY = 'switchify.remote.device-id.v1';
const TOKEN_PREFIX = 'switchify.remote.token.';

export type SavedPc = {
  desktopId: string;
  displayName: string;
  platform: PcPlatform;
  peripheralId: string;
  lastConnectedAt: number;
};

export interface PairingStorage {
  getDeviceId(): Promise<string>;
  list(): Promise<SavedPc[]>;
  token(desktopId: string): Promise<string | null>;
  save(pc: SavedPc, token: string): Promise<void>;
  remove(desktopId: string): Promise<void>;
  defaultDesktopId(): Promise<string | null>;
  setDefaultDesktopId(desktopId: string | null): Promise<void>;
}

type PublicStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
type SecretStorage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;

export class PairingStore implements PairingStorage {
  #storageQueue: Promise<void> = Promise.resolve();

  constructor(private readonly publicStorage: PublicStorage = AsyncStorage, private readonly secretStorage: SecretStorage = SecureStore) {}

  async getDeviceId(): Promise<string> {
    const existing = await this.secretStorage.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = `remote-${Crypto.randomUUID()}`;
    await this.secretStorage.setItemAsync(DEVICE_ID_KEY, created, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    return created;
  }

  async list(): Promise<SavedPc[]> {
    try { return await this.#serialized(() => this.#reconcileIndex()); }
    catch { return []; }
  }

  token(desktopId: string): Promise<string | null> { return this.secretStorage.getItemAsync(`${TOKEN_PREFIX}${desktopId}`); }

  async save(pc: SavedPc, token: string): Promise<void> {
    await this.#serialized(async () => {
      const next = (await this.#readIndex()).filter((item) => item.desktopId !== pc.desktopId);
      next.unshift(pc);
      const previousToken = await this.token(pc.desktopId);
      await this.secretStorage.setItemAsync(`${TOKEN_PREFIX}${pc.desktopId}`, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      try { await this.publicStorage.setItem(INDEX_KEY, JSON.stringify(next)); }
      catch (error) {
        if (previousToken) await this.secretStorage.setItemAsync(`${TOKEN_PREFIX}${pc.desktopId}`, previousToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        else await this.secretStorage.deleteItemAsync(`${TOKEN_PREFIX}${pc.desktopId}`);
        throw error;
      }
    });
  }

  async remove(desktopId: string): Promise<void> {
    await this.#serialized(async () => {
      const previous = await this.#readIndex();
      const previousToken = await this.token(desktopId);
      const previousDefault = await this.defaultDesktopId();
      const next = previous.filter((item) => item.desktopId !== desktopId);
      await this.secretStorage.deleteItemAsync(`${TOKEN_PREFIX}${desktopId}`);
      try {
        await this.publicStorage.setItem(INDEX_KEY, JSON.stringify(next));
        if (previousDefault === desktopId) await this.publicStorage.removeItem(`${INDEX_KEY}.default`);
      } catch (error) {
        let indexRestored = false;
        try { await this.publicStorage.setItem(INDEX_KEY, JSON.stringify(previous)); indexRestored = true; } catch { /* Leave the secret deleted if the public index cannot be restored. */ }
        if (indexRestored && previousDefault) await this.publicStorage.setItem(`${INDEX_KEY}.default`, previousDefault).catch(() => undefined);
        if (indexRestored && previousToken) await this.secretStorage.setItemAsync(`${TOKEN_PREFIX}${desktopId}`, previousToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }).catch(() => undefined);
        throw error;
      }
    });
  }

  defaultDesktopId(): Promise<string | null> { return this.publicStorage.getItem(`${INDEX_KEY}.default`); }
  async setDefaultDesktopId(desktopId: string | null): Promise<void> {
    await this.#serialized(async () => {
      if (desktopId) await this.publicStorage.setItem(`${INDEX_KEY}.default`, desktopId);
      else await this.publicStorage.removeItem(`${INDEX_KEY}.default`);
    });
  }

  async #readIndex(): Promise<SavedPc[]> {
    const raw = await this.publicStorage.getItem(INDEX_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Invalid pairing index.');
    return parsed.filter(isSavedPc).sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  }

  async #reconcileIndex(): Promise<SavedPc[]> {
    const previous = await this.#readIndex();
    const tokens = await Promise.all(previous.map((pc) => this.token(pc.desktopId)));
    const valid = previous.filter((_, index) => Boolean(tokens[index]));
    if (valid.length === previous.length) return valid;

    const previousDefault = await this.defaultDesktopId();
    const defaultMissing = previousDefault !== null && !valid.some((pc) => pc.desktopId === previousDefault);
    try {
      await this.publicStorage.setItem(INDEX_KEY, JSON.stringify(valid));
      if (defaultMissing) await this.publicStorage.removeItem(`${INDEX_KEY}.default`);
    } catch (error) {
      await this.publicStorage.setItem(INDEX_KEY, JSON.stringify(previous)).catch(() => undefined);
      if (previousDefault) await this.publicStorage.setItem(`${INDEX_KEY}.default`, previousDefault).catch(() => undefined);
      throw error;
    }
    return valid;
  }

  async #serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#storageQueue;
    let release!: () => void;
    this.#storageQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous.catch(() => undefined);
    try { return await operation(); }
    finally { release(); }
  }
}

function isSavedPc(value: unknown): value is SavedPc {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SavedPc>;
  return typeof item.desktopId === 'string' && typeof item.displayName === 'string' && typeof item.peripheralId === 'string' && typeof item.lastConnectedAt === 'number' && (item.platform === null || item.platform === 'windows' || item.platform === 'macos');
}
