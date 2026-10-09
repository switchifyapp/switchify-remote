/** Native apps have a single store instance, so the in-process queue is already exclusive. */
export function withStorageLock<T>(_name: string, operation: () => Promise<T>): Promise<T> {
  return operation();
}
