import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A, B, harness, tick } from './helpers/balanceHarness.ts';

// Report 49 Pass 3 (exact-SHA review of 94d71b3): the page-owner hold has no
// timer, failed reads are scoped to the page attempt that made them, and
// claims belong to the wallet session that took them.

/** The mixtape island's collector snapshot: claim, ticket, one 49-key batch. */
function collectorSnapshot(h: ReturnType<typeof harness>, wallet = A) {
  const release = h.core.claim(wallet);
  const seq = h.core.beginRead(wallet);
  const reads = [...Array.from({ length: 48 }, (_, i) => h.coalescer.read(`song-${i}`)), h.coalescer.read(wallet)];
  return { release, seq, reads };
}

test('Pass3-P1: a 33 s island JS delay never splits the snapshot: no fallback timer while the page loads', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true }); // header hydrates; island JS still loading
  assert.equal(h.timers.size, 0, 'no 30 s fallback timer');
  h.fireTimers();
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 0, 'still holding at 33 s');

  const unregister = h.core.registerPageOwner(); // JS finally arrives
  const releaseView = h.core.claim(A);
  const snap = collectorSnapshot(h);
  await tick();
  h.rpcs[0].answer();
  await Promise.all(snap.reads);
  h.core.setKnown(A, 100n, { seq: snap.seq });
  snap.release();
  releaseView();
  h.flushDeferred();
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49]);
  assert.equal(h.state.balance, 100n);
  unregister();
});

test('Pass3-P1: header hydrating 3 s after a failed snapshot sees the page already failed: [49] only, never [49, 1]', async () => {
  const h = harness(A);
  const unregister = h.core.registerPageOwner(); // island hydrates first
  const releaseView = h.core.claim(A);
  const snap = collectorSnapshot(h);
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49]);
  h.core.setError(A, { seq: snap.seq }); // the batch failed
  snap.release();
  releaseView(); // settled (error)
  h.flushDeferred();
  await tick();

  h.core.ensure(A, { deferMs: 120, awaitPageOwner: false }); // header hydrates late
  h.fireTimers();
  h.flushDeferred();
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49], 'no redundant 1-key read');
  assert.equal(h.state.error, true);
  assert.equal(h.state.loading, false);
  unregister();
});

test('Pass3-P1: an older Home error never suppresses the read on a later 404 mixtape page', async () => {
  const h = harness(A);
  h.ledger.delete(A); // RPC down on Home: the header read fails
  h.core.ensure(A);
  await tick();
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.error, true);

  h.ledger.set(A, 100n); // RPC recovers
  h.navigate(); // client-side navigation to a 404 mixtape
  h.core.ensure(A, { deferMs: 120 });
  const unregister = h.core.registerPageOwner();
  const release = h.core.claim(A); // island mounts, finds nothing to read
  release();
  h.flushDeferred();
  h.fireTimers();
  await tick();
  assert.equal(h.rpcs.length, 2, 'the 404 page reads the key itself');
  h.rpcs[1].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.error, false);
  unregister();
});

test('Pass3-P2: A→B→A on Home while A\'s collector claim is held: the fresh A session reads at once', async () => {
  const h = harness(A);
  const snap = collectorSnapshot(h); // A's collector request held in flight
  await tick();
  assert.equal(h.rpcs.length, 1);

  h.switchTo(B);
  h.core.reset();
  h.core.ensure(B);
  await tick();
  h.ledger.set(A, 300n);
  h.switchTo(A);
  h.core.reset();
  h.core.ensure(A); // Home, fresh A session
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys), [h.rpcs[0].keys, [B], [A]], 'A is read without waiting');
  h.rpcs[2].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 300n);

  // The departed collector finally settles: its stale release and result change nothing.
  h.rpcs[0].answer();
  await Promise.all(snap.reads);
  assert.equal(h.core.setKnown(A, 100n, { seq: snap.seq }), false);
  snap.release();
  h.flushDeferred();
  await tick();
  assert.equal(h.state.balance, 300n);
  assert.equal(h.rpcs.length, 3);
});

test('Pass3-P2: switching to B on the detail page never waits for A\'s held collector', async () => {
  const h = harness(A);
  const unregister = h.core.registerPageOwner();
  const snapA = collectorSnapshot(h);
  await tick();
  h.switchTo(B);
  h.core.reset();
  h.core.ensure(B, { deferMs: 120 });
  const snapB = collectorSnapshot(h, B); // the collector's new-generation read for B
  await tick();
  assert.equal(h.rpcs.length, 2, 'B\'s snapshot went out while A\'s is still held');
  h.rpcs[1].answer();
  await Promise.all(snapB.reads);
  assert.equal(h.core.setKnown(B, 200n, { seq: snapB.seq }), true);
  snapB.release();
  assert.equal(h.state.loading, false, 'B is not blocked by A\'s claim');
  snapA.release();
  unregister();
});

test('Pass3-P2: a claim released after its session ended can never unclaim the next session', async () => {
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
