/**
 * Monotonic "latest request wins" gate (25d P2-5). Every call to `begin()`
 * returns a strictly increasing id; only the most recent id is `current`, so a
 * slower, older response can never overwrite a newer one, whatever order the
 * network resolves them in. `reset()` invalidates everything in flight.
 */
export interface LatestGate {
  begin(): number;
  isCurrent(id: number): boolean;
  reset(): void;
  readonly latest: number;
}

export function createLatestGate(): LatestGate {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (id: number) => id === latest,
    reset: () => {
      latest += 1;
    },
    get latest() {
      return latest;
    },
  };
}
