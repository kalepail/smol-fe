/**
 * Per-key coalescing + same-tick batching for `getLedgerEntries` (pure: no SDK,
 * no RPC; the transport is injected so the semantics are unit-testable).
 *
 * - Keys requested in the same microtask go out together, ⌈n/maxPerCall⌉ calls.
 * - A key already requested joins that request (one RPC, every caller served).
 * - `fresh: true` (an explicit Refresh) never joins a request that has ALREADY
 *   BEEN SENT: an older in-flight read may predate the value the user expects,
 *   so a new request is queued. A key still waiting for this tick's flush has
 *   not been sent yet, so joining it is already fresh.
 * - Session scoping (`session`): a request already sent in an earlier wallet
 *   session is never joined by a read in a later one (A→B→A switch), even
 *   without `fresh`.
 */
import type { LedgerEntryRead } from './ledgerReads.ts';

export type FetchLedgerChunk = (keys: string[]) => Promise<Map<string, LedgerEntryRead>>;

export interface LedgerCoalescer {
  read(key: string, opts?: { fresh?: boolean }): Promise<LedgerEntryRead>;
}

export function createLedgerCoalescer(
  fetchChunk: FetchLedgerChunk,
  opts: { maxPerCall: number; schedule?: (flush: () => void) => void; session?: () => number }
): LedgerCoalescer {
  const schedule = opts.schedule ?? queueMicrotask;
  const session = opts.session ?? (() => 0);
  /** Latest request per key (queued or sent) and the session it was requested in. */
  const inflight = new Map<string, { promise: Promise<LedgerEntryRead>; session: number }>();
  let pending: Map<string, (read: LedgerEntryRead) => void> | null = null;

  async function send(keys: string[], resolvers: Map<string, (read: LedgerEntryRead) => void>) {
    let reads: Map<string, LedgerEntryRead> | null = null;
    let failure = 'Ledger read failed';
    try {
      reads = await fetchChunk(keys);
    } catch (error) {
      failure = error instanceof Error ? error.message : failure;
    }
    for (const key of keys) {
      resolvers.get(key)?.(reads?.get(key) ?? { state: 'error', error: failure });
    }
  }

  function flush() {
    const batch = pending;
    pending = null;
    if (!batch || batch.size === 0) return;
    const keys = [...batch.keys()];
    for (let i = 0; i < keys.length; i += opts.maxPerCall) {
      void send(keys.slice(i, i + opts.maxPerCall), batch);
    }
  }

  return {
    read(key, readOpts = {}) {
      const existing = inflight.get(key);
      const queued = pending?.has(key) === true; // not sent yet: joining it is fresh
      if (existing && (queued || (!readOpts.fresh && existing.session === session()))) return existing.promise;
      if (!pending) {
        pending = new Map();
        schedule(flush);
      }
      const batch = pending;
      const promise: Promise<LedgerEntryRead> = new Promise<LedgerEntryRead>((resolve) => {
        batch.set(key, resolve);
      }).finally(() => {
        // A newer (fresh) request for this key may have replaced this one.
        if (inflight.get(key)?.promise === promise) inflight.delete(key);
      });
      inflight.set(key, { promise, session: session() });
      return promise;
    },
  };
}
