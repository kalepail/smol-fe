import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBalanceCore, type BalanceState } from '../../src/stores/balanceCore.ts';

// Report 49: the shared KALE balance store (header pill, account sheet,
// /account) must never show another wallet's balance, never split a page's
// batched snapshot, never let an older read overwrite a newer Refresh, and
// never read after the session cookie is gone.

const A = 'CA_WALLET_A';
const B = 'CB_WALLET_B';

type Read = { address: string; fresh: boolean; resolve: (v: bigint | null) => void; reject: (e: unknown) => void };

function harness(initialWallet: string | null = A) {
  const state: BalanceState = { balance: null, loading: false, error: false, address: null, checkedAt: 0 };
  let wallet: string | null = initialWallet;
  let sessionWallet: string | null = initialWallet; // the live cookie
  let clock = 1_000_000;
  const reads: Read[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const deferredFns: (() => void)[] = [];
  const core = createBalanceCore(state, {
    readKale: (address, { fresh }) =>
      new Promise((resolve, reject) => reads.push({ address, fresh, resolve, reject })),
    activeWallet: () => wallet,
    validateSession: (address) => {
      wallet = sessionWallet; // reconcile against the cookie
      return wallet === address;
    },
    now: () => clock,
    setTimer: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id) => timers.delete(id as number),
    defer: (fn) => deferredFns.push(fn),
  });
  return {
    state,
    core,
    reads,
    timers,
    setWallet: (w: string | null) => {
      wallet = w;
      sessionWallet = w;
    },
    clearCookie: () => {
      sessionWallet = null;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    fireTimers: () => {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
    flushDeferred: () => {
      while (deferredFns.length) deferredFns.shift()!();
    },
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('P1-1: a result for wallet A never lands while B is active (trade snapshot race A -> B)', async () => {
  const h = harness(A);
  const seqA = h.core.beginRead(A); // trade snapshot for A starts
  h.setWallet(B);
  h.core.reset(); // TopBar reconcile on the switch
  h.core.ensure(B);
  assert.equal(h.reads.length, 1);
  h.reads[0].resolve(200n);
  await tick();
  assert.equal(h.state.address, B);
  assert.equal(h.state.balance, 200n);
  // A's response arrives late: refused (wrong wallet AND an older ticket).
  assert.equal(h.core.setKnown(A, 100n, { seq: seqA }), false);
  assert.equal(h.core.setKnown(A, 100n), false, 'no ticket still refuses an inactive wallet');
  assert.equal(h.state.balance, 200n);
  assert.equal(h.state.address, B);
});

test('P1-1: setKnown refuses to overwrite a different selected wallet', () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120 });
  assert.equal(h.state.address, A);
  h.setWallet(B); // userState switched, store not yet reconciled
  assert.equal(h.core.setKnown(B, 5n), false);
  assert.equal(h.state.address, A);
  assert.equal(h.state.balance, null);
});

test('P1-2: a page claim cancels the deferred timer; its value means zero shell reads', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120 }); // TopBar hydrates first
  assert.equal(h.timers.size, 1);
  const release = h.core.claim(A); // MixtapeDetailView mounts
  assert.equal(h.timers.size, 0, 'deferred timer cancelled');
  assert.equal(h.state.loading, true, 'pill shows loading while the page owns the load');
  h.core.ensure(A, { deferMs: 120 }); // navigation sync while claimed
  assert.equal(h.timers.size, 0);
  const seq = h.core.beginRead(A);
  assert.equal(h.core.setKnown(A, 49n, { seq }), true);
  release();
  h.flushDeferred();
  await tick();
  assert.equal(h.reads.length, 0, 'the 49-key snapshot served the header');
  assert.equal(h.state.balance, 49n);
  assert.equal(h.state.loading, false);
});

test('P1-2: a failed snapshot publishes its error so the shell sends no 1-key retry ([49] only)', async () => {
  const h = harness(A);
  const release = h.core.claim(A);
  h.core.ensure(A, { deferMs: 120 });
  const seq = h.core.beginRead(A);
  assert.equal(h.core.setError(A, { seq }), true);
  release();
  h.flushDeferred();
  h.fireTimers();
  await tick();
  assert.equal(h.reads.length, 0);
  assert.equal(h.state.error, true);
  assert.equal(h.state.loading, false);
  assert.equal(h.state.balance, null, 'never a fabricated 0');
});

test('P1-2: a claim released without any result hands the load back to the shell (one read)', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120 });
  const release = h.core.claim(A);
  release();
  release(); // idempotent
  h.flushDeferred();
  assert.equal(h.reads.length, 1);
  assert.equal(h.reads[0].fresh, true, 'never joins the released claimer\'s already-sent request (Pass 4)');
  h.reads[0].resolve(7n);
  await tick();
  assert.equal(h.state.balance, 7n);
  assert.equal(h.state.loading, false);
});

test('P2-3: an older snapshot never overwrites a newer Refresh, and Refresh reads fresh', async () => {
  const h = harness(A);
  h.core.ensure(A);
  h.reads[0].resolve(100n);
  await tick();
  const snapshotSeq = h.core.beginRead(A); // collector snapshot starts (sees 100)
  const refresh = h.core.update(A, { force: true }); // user clicks Refresh
  assert.equal(h.reads.length, 2);
  assert.equal(h.reads[1].fresh, true, 'forced read bypasses older in-flight requests');
  h.reads[1].resolve(300n);
  await refresh;
  assert.equal(h.state.balance, 300n);
  assert.equal(h.core.setKnown(A, 100n, { seq: snapshotSeq }), false, 'older snapshot refused');
  assert.equal(h.core.setError(A, { seq: snapshotSeq }), false, 'older error refused');
  assert.equal(h.state.balance, 300n);
  assert.equal(h.state.error, false);
});

test('P2-3: an older forced read resolving after a newer one is dropped', async () => {
  const h = harness(A);
  const first = h.core.update(A, { force: true });
  const second = h.core.update(A, { force: true });
  h.reads[1].resolve(300n);
  await second;
  h.reads[0].resolve(100n);
  await first;
  assert.equal(h.state.balance, 300n);
  assert.equal(h.state.loading, false);
});

test('P2-3: a failed Refresh keeps the last value and flags the error', async () => {
  const h = harness(A);
  h.core.ensure(A);
  h.reads[0].resolve(100n);
  await tick();
  const refresh = h.core.update(A, { force: true });
  h.reads[1].resolve(null);
  await refresh;
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.error, true);
  assert.equal(h.state.loading, false);
});

test('P2-4: a cleared cookie makes the pending timer send ZERO reads and clears the state', () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120 });
  assert.equal(h.state.address, A);
  h.clearCookie(); // another tab signed out
  h.fireTimers();
  assert.equal(h.reads.length, 0);
  assert.equal(h.state.address, null);
  assert.equal(h.state.balance, null);
  assert.equal(h.state.loading, false);
});

test('P2-4: reset drops any in-flight read for the signed-out session', async () => {
  const h = harness(A);
  h.core.ensure(A);
  h.setWallet(null);
  h.core.reset();
  h.reads[0].resolve(100n);
  await tick();
  assert.equal(h.state.balance, null);
  assert.equal(h.state.address, null);
  // Signing back in as A later never resurrects that old read either.
  h.setWallet(A);
  h.core.ensure(A);
  assert.equal(h.state.balance, null);
  assert.equal(h.reads.length, 2);
});

test('SWR: ensure is a no-op while fresh, re-reads once stale', async () => {
  const h = harness(A);
  h.core.ensure(A);
  h.reads[0].resolve(1n);
  await tick();
  h.core.ensure(A);
  assert.equal(h.reads.length, 1);
  h.advance(16_000);
  h.core.ensure(A);
  assert.equal(h.reads.length, 2);
});
