import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A, B, harness, tick } from './helpers/balanceHarness.ts';
import { snapshotMatchesHolder } from '../../src/utils/mixtapeOwnership.ts';

// Report 49 Pass 4 (exact-SHA review of 21f7f6b): a departed collector's
// already-sent request never serves the destination header, and a read that
// fails after navigation never suppresses the destination page's own load.

/** The mixtape island's collector snapshot: claim, ticket, one 49-key batch. */
function collectorSnapshot(h: ReturnType<typeof harness>, wallet = A) {
  const release = h.core.claim(wallet);
  const seq = h.core.beginRead(wallet);
  const reads = [...Array.from({ length: 48 }, (_, i) => h.coalescer.read(`song-${i}`)), h.coalescer.read(wallet)];
  return { release, seq, reads };
}

test('Pass4-P2: Home never adopts a departed collector\'s already-sent request (stale 100 → reads 300)', async () => {
  const h = harness(A);
  h.core.ensure(A, { deferMs: 120, awaitPageOwner: true }); // header on the detail page
  const unregister = h.core.registerPageOwner();
  const snap = collectorSnapshot(h); // A's 49-key request: sampled at 100 and held
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49]);

  h.ledger.set(A, 300n);
  h.navigate(); // to Home, still A
  snap.release(); // view departure drops the claim
  unregister();
  h.core.releasePageHold();
  h.core.ensure(A, { deferMs: 120 }); // Home's header
  h.flushDeferred();
  h.fireTimers();
  await tick();
  assert.deepEqual(h.rpcs.map((r) => r.keys.length), [49, 1], 'Home sends its own read');
  h.rpcs[1].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 300n, 'never the departed snapshot\'s 100');
  assert.equal(h.state.loading, false);

  // The departed request finally lands: no effect.
  h.rpcs[0].answer();
  await Promise.all(snap.reads);
  assert.equal(h.core.setKnown(A, 100n, { seq: snap.seq }), false);
  assert.equal(h.state.balance, 300n);
});

test('Pass4-P2: a Home read failing after navigation to a 404 mixtape never suppresses its recovery', async () => {
  const h = harness(A);
  h.ledger.delete(A); // RPC down: Home's header read will fail
  h.core.ensure(A);
  await tick();
  assert.equal(h.rpcs.length, 1, 'Home\'s read held in flight');

  h.ledger.set(A, 100n); // RPC restored
  h.navigate(); // to the 404 mixtape
  h.core.ensure(A, { deferMs: 120 }); // joins Home's in-flight read
  h.rpcs[0].answer(); // Home's read fails now
  await tick();
  await tick();
  assert.equal(h.state.error, false, 'the destination page is never stamped with Home\'s error');
  h.flushDeferred();
  h.fireTimers();
  await tick();
  assert.equal(h.rpcs.length, 2, 'the 404 page reads the key itself');
  h.rpcs[1].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 100n);
  assert.equal(h.state.error, false);
});

test('Pass4-P2: a departed page\'s external failure never cancels the destination\'s pending load', async () => {
  const h = harness(A);
  const seq = h.core.beginRead(A); // e.g. the collector's ticket on the detail page
  h.navigate();
  h.core.ensure(A, { deferMs: 120 }); // destination header scheduled
  assert.equal(h.core.setError(A, { seq }), false, 'not stamped on the destination');
  assert.equal(h.state.error, false);
  h.fireTimers(); // the destination's deferred read still fires
  await tick();
  assert.equal(h.rpcs.length, 1);
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.balance, 100n);
});

test('Pass4-P2: a same-page failure is still stamped (no redundant re-read)', async () => {
  const h = harness(A);
  h.ledger.delete(A);
  h.core.ensure(A);
  await tick();
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.error, true);
  h.core.ensure(A);
  h.flushDeferred();
  await tick();
  assert.equal(h.rpcs.length, 1);
});

test('Pass4-P1: a server snapshot that names another wallet is never this holder\'s', () => {
  assert.equal(snapshotMatchesHolder({ tracks: [] }, A), true, 'unnamed: the reconciled session decides');
  assert.equal(snapshotMatchesHolder({ holder: A, tracks: [] }, A), true);
  assert.equal(snapshotMatchesHolder({ holder: B, tracks: [] }, A), false);
  assert.equal(snapshotMatchesHolder({ wallet: B, tracks: [] }, A), false);
  assert.equal(snapshotMatchesHolder({ holder: A, wallet: B }, A), false);
});
