/**
 * Keyed single-flight: concurrent callers with the same key share ONE in-flight
 * run; a caller with a different key waits for the current run to settle first
 * (runs never overlap). A settled run (success or failure) is forgotten, so a
 * failure can be retried and a later call starts fresh.
 */
export function createSingleFlight<T>() {
  let current: { key: string; promise: Promise<T> } | null = null;

  return async function run(key: string, task: () => Promise<T>): Promise<T> {
    while (current) {
      if (current.key === key) return current.promise;
      await current.promise.catch(() => undefined);
    }
    const promise = task();
    const entry = { key, promise };
    current = entry;
    try {
      return await promise;
    } finally {
      if (current === entry) current = null;
    }
  };
}
