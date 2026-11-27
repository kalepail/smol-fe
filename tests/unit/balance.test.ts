import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotMatchesHolder } from '../../src/utils/mixtapeOwnership.ts';
import { createBalanceCore, READ_ABORTED, type BalanceState } from '../../src/stores/balanceCore.ts';
import { createLedgerCoalescer } from '../../src/utils/ledgerCoalescer.ts';
import type { LedgerEntryRead } from '../../src/utils/ledgerReads.ts';

const A = 'CA_WALLET_A';
const B = 'CB_WALLET_B';

const tick = () => new Promise((r) => setImmediate(r));

/**
 * The real store wiring in miniature: `readKale` lazily "imports" the
 * transport (a held promise), re-validates with `isCurrent()`, then reads the
 * KALE key through a real coalescer whose session epoch the core bumps.
 */
function harness(initialWallet: string | null = A) {
  const state: BalanceState = { balance: null, loading: false, error: false, address: null, checkedAt: 0 };
  let wallet: string | null = initialWallet;
  let cookieWallet: string | null = initialWallet;
  let epoch = 0;
  let now = 1_000_000;
  const ledger = new Map<string, bigint>([
    [A, 100n],
    [B, 200n],
  ]);
  /** Every RPC that actually went out: the keys it carried and how to answer it. */
  const rpcs: { keys: string[]; answer: () => void }[] = [];
  let holdTransport = false;
  let releaseTransport: (() => void) | null = null;
  const coalescer = createLedgerCoalescer(
    (keys) =>
      new Promise<Map<string, LedgerEntryRead>>((resolve) => {
        // The ledger value is sampled when the request is SENT.
        const snapshot = new Map(keys.map((k) => [k, { state: 'found', value: ledger.get(k) } as unknown as LedgerEntryRead]));
        rpcs.push({ keys, answer: () => resolve(snapshot) });
      }),
    { maxPerCall: 200, session: () => epoch }
  );
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const deferredFns: (() => void)[] = [];
  let pageAttempt = 0;
  const core = createBalanceCore(state, {
    readKale: async (address, { fresh, isCurrent }) => {
      if (holdTransport) await new Promise<void>((r) => (releaseTransport = r)); // lazy import in flight
      if (!isCurrent()) return READ_ABORTED;
      const read = (await coalescer.read(address, { fresh })) as unknown as { value?: bigint };
      return read.value ?? null;
    },
    activeWallet: () => wallet,
    now: () => now,
    validateSession: (address) => {
      wallet = cookieWallet;
      return wallet === address;
    },
    onSessionChange: () => {
      epoch++;
    },
    setTimer: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id) => timers.delete(id as number),
    defer: (fn) => deferredFns.push(fn),
    page: () => pageAttempt,
  });
  return {
    state,
    core,
    rpcs,
    timers,
    ledger,
    coalescer,
    advance: (ms: number) => { now += ms; },
    holdImport: () => {
      holdTransport = true;
    },
    releaseImport: () => {
      holdTransport = false;
      releaseTransport?.();
    },
    switchTo: (w: string | null) => {
      wallet = w;
      cookieWallet = w;
    },
    clearCookie: () => {
      cookieWallet = null;
    },
    fireTimers: () => {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
    /** A client-side navigation: a new page attempt. */
    navigate: () => {
      pageAttempt++;
    },
    flushDeferred: () => {
      while (deferredFns.length) deferredFns.shift()!();
    },
  };
}

test('a held read for wallet A cannot publish to wallet B', async () => {
  const h = harness();
  const oldRead = h.core.beginRead(A);
  h.switchTo(B);
  h.core.ensure(B);
  await tick();
  h.rpcs[0].answer();
  await tick();
  assert.equal(h.core.setKnown(A, 100n, { seq: oldRead }), false);
  assert.equal(h.core.setKnown(A, 100n), false);
  assert.equal(h.state.address, B);
  assert.equal(h.state.balance, 200n);
});

test('refresh bypasses an older read and keeps the newest result', async () => {
  const h = harness();
  const first = h.core.update(A, { force: true });
  await tick();
  const snapshot = h.core.beginRead(A);
  h.ledger.set(A, 300n);
  const recent = h.core.update(A, { force: true });
  await tick();
  assert.deepEqual(h.rpcs.map((read) => read.keys), [[A], [A]]);
  h.rpcs[1].answer();
  await recent;
  h.rpcs[0].answer();
  await first;
  assert.equal(h.core.setKnown(A, 100n, { seq: snapshot }), false);
  assert.equal(h.core.setError(A, { seq: snapshot }), false);
  assert.equal(h.state.balance, 300n);
  assert.equal(h.state.error, false);
  assert.equal(h.state.loading, false);
});

test('a failed refresh keeps the last known balance and flags the error', async () => {
  const h = harness();
  const initial = h.core.update(A);
  await tick();
  h.rpcs[0].answer();
  await initial;
  h.ledger.delete(A);
  const refresh = h.core.update(A, { force: true });
  await tick();
  h.rpcs[1].answer();
  await refresh;
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.error, true);
  assert.equal(h.state.loading, false);
});

test('ensure reuses a fresh balance and reads again after it goes stale', async () => {
  const h = harness();
  h.core.ensure(A);
  await tick();
  h.rpcs[0].answer();
  await tick();
  h.core.ensure(A);
  await tick();
  assert.equal(h.rpcs.length, 1);
  h.advance(16_000);
  h.core.ensure(A);
  await tick();
  assert.equal(h.rpcs.length, 2);
});

test('the header and mixtape share one snapshot after the island hydrates', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true }); // TopBar first, island JS delayed
  assert.equal(h.timers.size, 0, 'no 120 ms dispatch timer and no fallback timer');
  assert.equal(h.state.loading, true, 'pill shows its loading skeleton');
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 0, 'nothing sent before the island hydrates (delayed 1.8 s+)');

  // The island hydrates late: registers + claims (replacing the hold), and its
  // collector snapshot carries the KALE key in ONE batch with the songs.
  const unregister = h.core.registerPageOwner();
  const releaseView = h.core.claim(A);
  const releaseCollector = h.core.claim(A);
  const seq = h.core.beginRead(A);
  const songs = Array.from({ length: 48 }, (_, i) => h.coalescer.read(`song-${i}`));
  const kale = h.coalescer.read(A);
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49], 'exactly [49], never [1, 49]');
  h.rpcs[0].answer();
  const read = (await kale) as unknown as { value: bigint };
  await Promise.all(songs);
  assert.equal(h.core.setKnown(A, read.value, { seq }), true);
  releaseCollector();
  releaseView();
  h.flushDeferred();
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49], 'the header was served by the snapshot');
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.loading, false);
  unregister();
});

test('the header loads its balance when detail hydration fails', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true });
  h.core.releasePageHold(); // the header's import probe of the island's module rejected
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 1);
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.loading, false);
});

test('logout while the lazy ledger-module import is held sends ZERO RPCs', async () => {
  const h = harness(A);
  h.holdImport();
  h.core.ensure(A, { deferMs: 120 });
  h.fireTimers(); // the deferred read starts: session still valid at dispatch
  await tick();
  assert.equal(h.state.loading, true);
  h.clearCookie(); // signed out (cookie cleared, focus reconcile)
  h.releaseImport();
  await tick();
  await tick();
  assert.equal(h.rpcs.length, 0, 'no wallet ledger RPC after the import resolved');
  assert.equal(h.state.address, null);
  assert.equal(h.state.balance, null);
  assert.equal(h.state.loading, false);
  assert.equal(h.state.error, false, 'an aborted read is not an error');
});

test("A→B→A ignores A's pre-switch 100-KALE request and displays 300 KALE", async () => {
  const h = harness(A);
  h.core.ensure(A); // A's header read: 100 KALE, held in flight
  await tick();
  assert.equal(h.rpcs.length, 1);

  h.switchTo(B);
  h.core.ensure(B); // TopBar effect on the switch
  await tick();
  assert.equal(h.rpcs.length, 2);

  h.ledger.set(A, 300n); // A's balance changes meanwhile
  h.switchTo(A);
  h.core.ensure(A);
  await tick();
  assert.equal(h.rpcs.length, 3, 'the new A session sends its own request');
  assert.deepEqual(h.rpcs[2].keys, [A]);

  h.rpcs[2].answer(); // current A: 300
  await tick();
  await tick();
  assert.equal(h.state.address, A);
  assert.equal(h.state.balance, 300n);

  h.rpcs[0].answer(); // A's original response (100) finally arrives
  h.rpcs[1].answer(); // B's too
  await tick();
  await tick();
  assert.equal(h.state.balance, 300n, "the pre-switch response never lands in the new session");
  assert.equal(h.state.address, A);
  assert.equal(h.state.loading, false);
});

test('a claim released after its session ended can never unclaim the next session', async () => {
  const h = harness(A);
  const stale = h.core.claim(A);
  h.switchTo(B);
  h.core.reset();
  h.switchTo(A);
  h.core.reset();
  const fresh = h.core.claim(A); // the new session's owner
  stale(); // the old one settles late
  h.core.ensure(A);
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 0, 'still owned by the fresh claim');
  fresh();
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 1, 'released: the shell reads');
});
test('a server snapshot that names another wallet is never this holder\'s', () => {
  assert.equal(snapshotMatchesHolder({ tracks: [] }, A), true, 'unnamed: the reconciled session decides');
  assert.equal(snapshotMatchesHolder({ holder: A, tracks: [] }, A), true);
  assert.equal(snapshotMatchesHolder({ holder: B, tracks: [] }, A), false);
  assert.equal(snapshotMatchesHolder({ wallet: B, tracks: [] }, A), false);
  assert.equal(snapshotMatchesHolder({ holder: A, wallet: B }, A), false);
});

for (const first of ['departed collector', 'destination read'] as const) {
  test(`same-wallet navigation discards the old balance when the ${first} completes first`, async () => {
    const h = harness();
    const release = h.core.claim(A);
    const seq = h.core.beginRead(A);
    h.ledger.delete(A); // The destination read fails.
    h.navigate();
    release();
    h.core.ensure(A, { deferMs: 120 });
    h.flushDeferred();
    h.fireTimers();
    await tick();
    assert.deepEqual(h.rpcs.map((rpc) => rpc.keys), [[A]]);

    const publishOldBalance = () => assert.equal(h.core.setKnown(A, 100n, { seq }), false);
    if (first === 'departed collector') {
      publishOldBalance();
      assert.equal(h.state.balance, null);
      assert.equal(h.state.loading, true);
    }
    h.rpcs[0].answer();
    await tick();
    if (first === 'destination read') publishOldBalance();
    assert.equal(h.state.balance, null);
    assert.equal(h.state.error, true);
    assert.equal(h.state.loading, false);
    assert.equal(h.rpcs.length, 1);
  });
}

test('a departed read landing with no destination read pending makes the destination read for itself', async () => {
  const h = harness(A);
  const seq = h.core.beginRead(A);
  h.navigate();
  assert.equal(h.core.setKnown(A, 100n, { seq }), false);
  assert.equal(h.state.balance, null);
  h.ledger.set(A, 300n);
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 1, 'the destination reads the key itself');
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 300n);
});

test('a same-page ticketed read still commits', () => {
  const h = harness(A);
  const seq = h.core.beginRead(A);
  assert.equal(h.core.setKnown(A, 100n, { seq }), true);
  assert.equal(h.state.balance, 100n);
});
