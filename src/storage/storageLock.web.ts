const LOCK_WAIT_MS = 10_000;

type LockManager = {
  request<T>(name: string, options: { mode: 'exclusive'; signal: AbortSignal }, callback: () => Promise<T>): Promise<T>;
};

/**
 * Every tab has its own store but shares the saved-PC index and tokens. A read,
 * change and write of that shared state must hold one cross-tab lock, or two tabs
 * saving at once can each drop the other's PC.
 */
export async function withStorageLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) throw new Error('Secure storage is unavailable in this browser.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCK_WAIT_MS);
  try {
    return await locks.request(`switchify.remote.${name}`, { mode: 'exclusive', signal: controller.signal }, async () => {
      clearTimeout(timer);
      return await operation();
    });
  } finally {
    clearTimeout(timer);
  }
}
