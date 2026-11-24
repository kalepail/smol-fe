/**
 * KALE balance coordinator (pure TS: the Svelte store in `balance.svelte.ts`
 * passes its `$state` object and the real transport; unit tests pass fakes).
 *
 * Invariants:
 * - Only the active wallet's balance is ever written. A result for any other
 *   wallet (account switch, sign-out, another tab) is dropped.
 * - Monotonic sequencing: every read takes a ticket (`beginRead`) BEFORE it
 *   starts. A result commits only if its ticket is newer than the last
 *   committed one, so an older in-flight snapshot or trade read can never
 *   overwrite a newer Refresh. Selecting a wallet raises the floor, so reads
 *   started for a previous session can never land in the next one.
 * - Ownership: a page that is about to read the KALE key inside its own
 *   batched snapshot claims the load synchronously (`claim`). While claimed,
 *   the shell's auto-load waits instead of sending a separate 1-key read; on
 *   release it only reads if the page produced neither a value nor an error.
 *   Claims belong to the wallet session that took them: a new session (switch,
 *   A→B→A, sign-out) drops every claim, and a stale release is a no-op, so a
 *   departed reader can never block the next session's load.
 * - Errors are scoped to the page attempt that produced them (`page()`): on
 *   the same page the auto-load never re-reads a key that already failed, but
 *   an older page's error never suppresses a new page's load.
 * - A failed read never fabricates `0n`; a failed refresh keeps the last value.
 * - The deferred auto-load re-validates the live session immediately before
 *   dispatch: a cleared cookie sends zero RPCs and clears the state. Every
 *   read re-validates again after its lazy transport import (`isCurrent`),
 *   immediately before the RPC is requested.
 * - Wallet sessions are isolated: selecting a wallet (or resetting) starts a
 *   new session (`onSessionChange`), so the transport never lets a read in the
 *   new session join a request already sent in an earlier one (A→B→A).
 * - Page owners: on a route whose page island will read the KALE key in its
 *   batched snapshot, the shell holds the load (`ensure({ awaitPageOwner })`)
 *   until that island registers and claims it, so hydration order and slow
 *   page data never split the snapshot. There is no timer: the hold ends only
 *   when the island claims, the shell leaves the route, the page reports that
 *   the island failed to load (`releasePageHold`), or the session changes.
 * - A released claim never leaves its request joinable: the next read for
 *   that wallet is `fresh`, so a departed collector's already-sent snapshot
 *   can never serve (or stall) the destination page's header.
 * - A read belongs to the page attempt that started it: if it settles (value
 *   or failure) after the user navigated on, it never writes to (or cancels
 *   the pending load of) the destination page, which then reads for itself.
 */

/** `readKale` result when `isCurrent()` failed after the lazy import: nothing was sent. */
export const READ_ABORTED: unique symbol = Symbol('kale-read-aborted');

export interface BalanceState {
  balance: bigint | null;
  loading: boolean;
  error: boolean;
  address: string | null;
  checkedAt: number;
}

export interface BalanceCoreDeps {
  /**
   * One KALE balance read: the amount, or `null` when unknown (RPC error,
   * archive-blind omission). Must call `isCurrent()` after any lazy import and
   * immediately before requesting the key, returning `READ_ABORTED` (zero RPCs)
   * when it is false.
   */
  readKale: (
    address: string,
    opts: { fresh: boolean; isCurrent: () => boolean }
  ) => Promise<bigint | null | typeof READ_ABORTED>;
  /** A new wallet session began (switch, sign-in, reset): drop transport reuse across sessions. */
  onSessionChange?: () => void;
  /** The signed-in wallet right now (no cookie read). */
  activeWallet: () => string | null;
  /** Reconcile against the live session cookie; true while `address` is still the signed-in wallet. */
  validateSession: (address: string) => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Schedules the post-release auto-load (default: microtask). */
  defer?: (fn: () => void) => void;
  onError?: (error: unknown) => void;
  freshMs?: number;
  /** Identity of the current page attempt (bumped per navigation); scopes `error`. */
  page?: () => unknown;
}

export interface BalanceCore {
  update(address: string, opts?: { force?: boolean }): Promise<void>;
  ensure(address: string, opts?: { deferMs?: number; awaitPageOwner?: boolean }): void;
  claim(address: string): () => void;
  /** A page island that owns its route's KALE read mounted; returns unregister. */
  registerPageOwner(): () => void;
  /** Drop the shell's hold for a page owner (left its route, or its island failed to load). */
  releasePageHold(): void;
  beginRead(address: string): number;
  setKnown(address: string, balance: bigint, opts?: { seq?: number }): boolean;
  setError(address: string, opts?: { seq?: number }): boolean;
  reset(): void;
  isFresh(address: string): boolean;
}

export function createBalanceCore(state: BalanceState, deps: BalanceCoreDeps): BalanceCore {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const defer = deps.defer ?? queueMicrotask;
  const freshMs = deps.freshMs ?? 15_000;
  const page = deps.page ?? (() => 0);

  let startedSeq = 0;
  let committedSeq = 0;
  let inflight: { address: string; token: object; promise: Promise<void> } | null = null;
  let deferred: { address: string; handle: unknown } | null = null;
  /** Claims taken in the current wallet session (`epoch`). */
  const claims = new Map<string, number>();
  let epoch = 0;
  /** The page attempt whose read set `state.error`. */
  let errorPage: unknown = undefined;
  /** The shell asked for `address` while a page owned the load. */
  let wanted: string | null = null;
  /** Mounted page islands that own their route's KALE read. */
  let pageOwners = 0;
  /** The shell's claim on behalf of a page owner that has not hydrated yet. */
  let pageHold: { address: string; release: () => void } | null = null;
  /** The page attempt each started read belongs to (by sequencing ticket). */
  const readPages = new Map<number, unknown>();
  /** A claim was released: the next read for this wallet never joins a sent request. */
  let freshNext: string | null = null;

  function newSession(): void {
    inflight = null; // a pre-switch read can never be joined (or settle) in this session
    // Claims taken for the previous session (e.g. a departed collector's
    // stalled snapshot) can never block this one; their releases are no-ops.
    epoch++;
    claims.clear();
    wanted = null;
    freshNext = null; // the session change already isolates the transport
    readPages.clear(); // earlier sessions' reads can never commit (committedSeq)
    deps.onSessionChange?.();
  }

  /** Release the page hold. `silent` (reset/switch): never schedule a read for it. */
  function dropPageHold(silent: boolean): void {
    const hold = pageHold;
    if (!hold) return;
    pageHold = null;
    if (silent && wanted === hold.address) wanted = null;
    hold.release();
  }

  function cancelDeferred(address?: string): void {
    if (!deferred || (address !== undefined && deferred.address !== address)) return;
    clearTimer(deferred.handle);
    deferred = null;
  }

  const isClaimed = (address: string) => (claims.get(address) ?? 0) > 0;
  /** This page attempt already read the key and failed: never re-read it automatically. */
  const pageAlreadyFailed = () => state.error && errorPage === page();

  /** Account switch: never show (or keep loading) another wallet's balance. */
  function selectAddress(address: string): void {
    if (state.address === address) return;
    cancelDeferred();
    if (pageHold && pageHold.address !== address) dropPageHold(true);
    committedSeq = startedSeq; // reads started for the previous wallet can never commit
    newSession();
    state.address = address;
    state.balance = null;
    state.loading = false;
    state.error = false;
    state.checkedAt = 0;
  }

  function isFresh(address: string): boolean {
    return state.address === address && state.balance !== null && now() - state.checkedAt < freshMs;
  }

  function beginRead(address: string): number {
    if (deps.activeWallet() === address) selectAddress(address);
    const seq = ++startedSeq;
    readPages.set(seq, page()); // a read belongs to the page attempt that started it
    return seq;
  }

  function accepts(address: string, seq: number): boolean {
    if (deps.activeWallet() !== address) return false; // signed out or switched away
    if (state.address !== null && state.address !== address) return false;
    if (seq <= committedSeq) return false; // a newer result already landed
    state.address = address;
    committedSeq = seq;
    return true;
  }

  function settleLoading(address: string): void {
    if (state.address !== address || inflight?.address === address) return;
    state.loading = isClaimed(address) && state.balance === null;
  }

  function setKnown(address: string, balance: bigint, opts: { seq?: number } = {}): boolean {
    if (opts.seq !== undefined) {
      const readPage = readPages.has(opts.seq) ? readPages.get(opts.seq) : page();
      if (readPage !== page()) {
        // Resolved after the user navigated on (e.g. a departed collector):
        // never write it onto (or cancel the pending load of) the destination
        // page, which may have joined this read. It reads for itself.
        readPages.delete(opts.seq);
        if (deps.activeWallet() === address && state.address === address && deferred?.address !== address) {
          defer(() => run(address));
        }
        return false;
      }
      readPages.delete(opts.seq);
    }
    if (!accepts(address, opts.seq ?? ++startedSeq)) return false;
    cancelDeferred(address);
    state.balance = balance;
    state.error = false;
    state.checkedAt = now();
    settleLoading(address);
    return true;
  }

  function setError(address: string, opts: { seq?: number } = {}): boolean {
    const seq = opts.seq ?? ++startedSeq;
    const readPage = readPages.has(seq) ? readPages.get(seq) : page();
    readPages.delete(seq);
    if (readPage !== page()) {
      // Failed after the user navigated on: never stamp the error on (or
      // cancel the pending load of) the destination page, which may have
      // joined this read. It reads for itself once this read has settled.
      if (deps.activeWallet() === address && state.address === address && deferred?.address !== address) {
        defer(() => run(address));
      }
      return false;
    }
    if (!accepts(address, seq)) return false;
    // The read that would have served the shell failed: no redundant retry.
    cancelDeferred(address);
    state.error = true;
    errorPage = page();
    settleLoading(address);
    return true;
  }

  function dispatch(address: string, fresh: boolean): Promise<void> {
    const seq = beginRead(address);
    if (freshNext === address) {
      freshNext = null;
      fresh = true;
    }
    state.loading = true;
    const token = {};
    // Registered BEFORE the read starts, so `isCurrent` holds even when the
    // transport is already loaded (no await before the check).
    const entry: { address: string; token: object; promise: Promise<void> } = {
      address,
      token,
      promise: Promise.resolve(),
    };
    inflight = entry;
    // Still this session's newest read for the signed-in wallet (live cookie)?
    const isCurrent = () =>
      inflight?.token === token && seq > committedSeq && state.address === address && deps.validateSession(address);
    entry.promise = (async () => {
      try {
        const value = await deps.readKale(address, { fresh, isCurrent });
        if (value === READ_ABORTED) {
          // Signed out / switched while the transport loaded: zero RPCs, no error.
          if (inflight?.token === token && !deps.validateSession(address)) {
            if (state.address === address || deps.activeWallet() === null) reset();
          }
          return;
        }
        if (value === null) setError(address, { seq });
        else setKnown(address, value, { seq });
      } catch (error) {
        deps.onError?.(error);
        setError(address, { seq });
      } finally {
        if (inflight?.token === token) {
          inflight = null;
          settleLoading(address);
        }
      }
    })();
    return entry.promise;
  }

  function markLoading(address: string): void {
    if (state.address === address && state.balance === null) state.loading = true;
  }

  function run(address: string): void {
    if (!deps.validateSession(address)) {
      // Signed out (or switched) since this was scheduled: zero RPCs.
      if (state.address === address || deps.activeWallet() === null) reset();
      return;
    }
    if (state.address !== address) return;
    if (isFresh(address) || inflight?.address === address) return;
    if (isClaimed(address)) {
      wanted = address;
      markLoading(address);
      return;
    }
    // This page (its owner's snapshot, or the shell) already read the key and
    // failed: never re-read it. An older page's error never suppresses this.
    if (pageAlreadyFailed()) return;
    void dispatch(address, false);
  }

  function update(address: string, opts: { force?: boolean } = {}): Promise<void> {
    cancelDeferred();
    selectAddress(address);
    if (!opts.force) {
      if (isFresh(address)) return Promise.resolve();
      if (inflight?.address === address) return inflight.promise;
      if (isClaimed(address)) {
        wanted = address;
        markLoading(address);
        return Promise.resolve();
      }
    }
    // A forced Refresh never joins an older in-flight ledger read.
    return dispatch(address, opts.force === true);
  }

  function ensure(address: string, opts: { deferMs?: number; awaitPageOwner?: boolean } = {}): void {
    selectAddress(address);
    if (isFresh(address) || inflight?.address === address) return;
    if (opts.awaitPageOwner && pageOwners === 0 && !isClaimed(address)) {
      // This route's page island will read the KALE key in its own batched
      // snapshot but has not hydrated yet: wait for it (however slow its JS)
      // instead of racing it with a 1-key read.
      holdForPage(address);
    }
    if (deferred?.address === address) return;
    if (isClaimed(address)) {
      wanted = address;
      markLoading(address);
      return;
    }
    const deferMs = opts.deferMs ?? 0;
    if (deferMs <= 0) {
      run(address);
      return;
    }
    const handle = setTimer(() => {
      if (deferred?.handle !== handle) return;
      deferred = null;
      run(address);
    }, deferMs);
    deferred = { address, handle };
  }

  function holdForPage(address: string): void {
    if (pageHold?.address === address) return;
    dropPageHold(true);
    pageHold = { address, release: acquire(address) };
  }

  function releasePageHold(): void {
    dropPageHold(false);
  }

  function registerPageOwner(): () => void {
    pageOwners++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      pageOwners--;
    };
  }

  /** The page itself claims: its claim replaces the shell's hold on its behalf. */
  function claim(address: string): () => void {
    const release = acquire(address);
    if (pageHold?.address === address) dropPageHold(false);
    return release;
  }

  function acquire(address: string): () => void {
    // Select first: a session change clears claims, never this new one.
    if (deps.activeWallet() === address) selectAddress(address);
    const claimEpoch = epoch;
    claims.set(address, (claims.get(address) ?? 0) + 1);
    if (deferred?.address === address) {
      // The shell's timer would race the page's batched read with a 1-key read.
      cancelDeferred(address);
      wanted = address;
    }
    if (inflight?.address !== address) markLoading(address);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (claimEpoch !== epoch) return; // its session ended: already dropped
      const remaining = (claims.get(address) ?? 1) - 1;
      if (remaining > 0) {
        claims.set(address, remaining);
        return;
      }
      claims.delete(address);
      // The claimer's request may already be sent (and stalled or stale, e.g. a
      // departed collector): the next read never joins it.
      freshNext = address;
      settleLoading(address);
      if (wanted === address) {
        wanted = null;
        defer(() => run(address));
      }
    };
  }

  function reset(): void {
    cancelDeferred();
    dropPageHold(true);
    committedSeq = startedSeq;
    newSession();
    state.balance = null;
    state.loading = false;
    state.error = false;
    state.address = null;
    state.checkedAt = 0;
  }

  return {
    update,
    ensure,
    claim,
    registerPageOwner,
    releasePageHold,
    beginRead,
    setKnown,
    setError,
    reset,
    isFresh,
  };
}
