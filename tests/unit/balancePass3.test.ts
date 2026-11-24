import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A, B, harness, tick } from './helpers/balanceHarness.ts';

// Report 49 Pass 2 (exact-SHA review of 13373d4): page-owner holds for the
// mixtape snapshot ([49], never [1, 49]), session revalidation after the lazy
// transport import (zero RPCs after logout), and wallet-session scoping of
// in-flight transport reuse (A→B→A never adopts A's pre-switch response).

// ---------------------------------------------------------------------------
// Pass-2 P1: page-owner hold (slow /likes, delayed island JS)
// ---------------------------------------------------------------------------

test('Pass2-P1: header hydrates first on a mixtape route and holds (no 120 ms 1-key read) until the island claims', async () => {
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

test('Pass2-P1: a slow /likes (17.5 s+) never releases the island claim on a timer: still [49]', async () => {
  const h = harness(A);
  const unregister = h.core.registerPageOwner(); // island hydrates first
  const releaseView = h.core.claim(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true }); // TopBar hydrates
  assert.equal(h.timers.size, 0, 'the island already owns the load: no hold, no shell timer');
  // 17.5 s+ of /likes: nothing fires (the core has no claim timeout).
  h.fireTimers();
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 0);
  // Collector snapshot finally runs.
  const seq = h.core.beginRead(A);
  const reads = [...Array.from({ length: 48 }, (_, i) => h.coalescer.read(`song-${i}`)), h.coalescer.read(A)];
  await tick();
  h.rpcs[0].answer();
  await Promise.all(reads);
  h.core.setKnown(A, 100n, { seq });
  releaseView();
  h.flushDeferred();
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49]);
  assert.equal(h.state.balance, 100n);
  unregister();
});

test('Pass2-P1: a 404 mixtape (island claims then releases without reading) still loads the header once', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true });
  const unregister = h.core.registerPageOwner();
  const release = h.core.claim(A);
  release(); // not found: nothing to read
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 1, 'the shell reads the key itself');
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.loading, false, 'no stuck skeleton');
  unregister();
});

test('Pass2-P1: navigating away before the island hydrates hands the load back to the shell', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true });
  h.core.releasePageHold(); // astro:after-swap to Home
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 1);
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 100n);
});

test('Pass2-P1: if the island\'s JS fails to load (explicit page error), the header loads itself (no stuck skeleton)', async () => {
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

test('Pass2-P1: sign-out while holding for the island drops the hold silently (zero reads)', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true });
  h.switchTo(null);
  h.core.reset();
  h.fireTimers();
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 0);
  assert.equal(h.state.address, null);
  assert.equal(h.state.loading, false);
});

// ---------------------------------------------------------------------------
// Pass-2 P2: logout while the lazy ledger module is loading
// ---------------------------------------------------------------------------

test('Pass2-P2: logout while the lazy ledger-module import is held sends ZERO RPCs', async () => {
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

test('Pass2-P2: switching wallets while the import is held sends no read for the old wallet', async () => {
  const h = harness(A);
  h.holdImport();
  h.core.ensure(A);
  await tick();
  h.switchTo(B);
  h.core.reset();
  h.core.ensure(B); // B's read also waits on the same import
  h.releaseImport();
  await tick();
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys), [[B]], 'only the active wallet B was read');
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.address, B);
  assert.equal(h.state.balance, 200n);
});

// ---------------------------------------------------------------------------
// Pass-2 P2: A→B→A never adopts A's pre-switch in-flight transport promise
// ---------------------------------------------------------------------------

test("Pass2-P2: A→B→A ignores A's pre-switch 100-KALE request and displays 300 KALE", async () => {
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

test('Pass2-P2: A→B→A where B was already fresh still re-reads A (no stuck skeleton)', async () => {
  const h = harness(A);
  h.core.ensure(A);
  await tick();
  h.switchTo(B);
  const seqB = h.core.beginRead(B); // B served by a page snapshot (no header read)
  assert.equal(h.core.setKnown(B, 200n, { seq: seqB }), true);
  h.switchTo(A);
  h.core.ensure(A);
  await tick();
  assert.equal(h.rpcs.length, 2, 'A is read again in its new session');
  h.rpcs[1].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.loading, false);
});
