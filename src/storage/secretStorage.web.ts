import type * as SecureStore from 'expo-secure-store';

export type SecretStorage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;

const DATABASE = 'switchify-remote-secrets';
const STORE = 'keys';
const KEY_ID = 'aes-gcm-v1';
const VALUE_PREFIX = 'switchify.remote.secret.v1.';

let keyPromise: Promise<CryptoKey> | null = null;

function unavailable(): Error {
  return new Error('Secure storage is unavailable in this browser.');
}

function requireSecureContext(): void {
  if (typeof window === 'undefined' || !window.isSecureContext || !window.crypto?.subtle || !window.indexedDB) throw unavailable();
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? unavailable());
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const open = window.indexedDB.open(DATABASE, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  return await request(open);
}

async function storedKey(database: IDBDatabase): Promise<CryptoKey | undefined> {
  return await request(database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID)) as CryptoKey | undefined;
}

/** A non-extractable key: the page can use it, but it cannot be read out of the browser. */
async function loadKey(): Promise<CryptoKey> {
  requireSecureContext();
  const database = await openDatabase();
  try {
    const existing = await storedKey(database);
    if (existing) return existing;
    const created = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    try {
      await request(database.transaction(STORE, 'readwrite').objectStore(STORE).add(created, KEY_ID));
      return created;
    } catch (error) {
      // Another tab stored its key first; every tab must use the same one.
      const raced = await storedKey(database);
      if (raced) return raced;
      throw error;
    }
  } finally {
    database.close();
  }
}

function key(): Promise<CryptoKey> {
  keyPromise ??= loadKey().catch((error: unknown) => {
    keyPromise = null;
    throw error;
  });
  return keyPromise;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parse(stored: string): { iv: Uint8Array<ArrayBuffer>; data: Uint8Array<ArrayBuffer> } | null {
  const [iv, data, extra] = stored.split('.');
  if (!iv || !data || extra !== undefined) return null;
  try {
    return { iv: fromBase64(iv), data: fromBase64(data) };
  } catch {
    return null;
  }
}

/**
 * Only a value that fails authentication under the current key is treated as absent.
 * A key that cannot be loaded is an error, so a temporary storage failure never looks
 * like missing pairings.
 */
async function getItemAsync(name: string): Promise<string | null> {
  requireSecureContext();
  const stored = window.localStorage.getItem(`${VALUE_PREFIX}${name}`);
  if (stored === null) return null;
  const parsed = parse(stored);
  if (!parsed) return null;
  const secret = await key();
  try {
    const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: parsed.iv, additionalData: new TextEncoder().encode(name) }, secret, parsed.data);
    return new TextDecoder().decode(plain);
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'OperationError') return null;
    throw error;
  }
}

async function setItemAsync(name: string, value: string): Promise<void> {
  requireSecureContext();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(name) }, await key(), new TextEncoder().encode(value));
  window.localStorage.setItem(`${VALUE_PREFIX}${name}`, `${toBase64(iv)}.${toBase64(new Uint8Array(data))}`);
}

async function deleteItemAsync(name: string): Promise<void> {
  requireSecureContext();
  window.localStorage.removeItem(`${VALUE_PREFIX}${name}`);
}

export const secretStorage = { getItemAsync, setItemAsync, deleteItemAsync } as SecretStorage;
