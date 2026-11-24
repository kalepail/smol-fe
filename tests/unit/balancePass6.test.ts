import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A, harness, tick } from './helpers/balanceHarness.ts';

// Report 49 Pass 5 (exact-SHA review of af52730): a departed collector's
// successful read never publishes to the destination page, whichever order
// the responses land in and even when the destination's own read fails.

/** The collector's ticket on the detail page, then a soft navigation to Home whose own read is in flight. */
async function departedCollectorWithHomeRead(h: ReturnType<typeof harness>) {
  const release = h.core.claim(A);
  const seq = h.core.beginRead(A); // collector's 49-key snapshot ticket (sampled at 100)
  h.ledger.delete(A); // Home's read will fail
  h.navigate();
  release(); // view departure drops the claim
  h.core.ensure(A, { deferMs: 120 });
  h.flushDeferred();
  h.fireTimers();
  await tick();
  assert.equal(h.rpcs.length, 1, 'Home sends its own read');
  return seq;
}

test('Pass5-P2: departed collector resolves first, then Home fails: never 100 on Home', async () => {
  const h = harness(A);
  const seq = await departedCollectorWithHomeRead(h);
  assert.equal(h.core.setKnown(A, 100n, { seq }), false, 'a departed read never commits');
  assert.equal(h.state.balance, null);
  assert.equal(h.state.loading, true, 'Home\'s pending load is not cancelled');
  h.flushDeferred(); // Home's read is in flight: no extra RPC
  await tick();
  assert.equal(h.rpcs.length, 1);
  h.rpcs[0].answer(); // Home's read fails
  await tick();
  await tick();
  assert.equal(h.state.balance, null, 'never the departed collector\'s 100');
  assert.equal(h.state.error, true, 'Home\'s own failure is shown');
  assert.equal(h.state.loading, false);
});

test('Pass5-P2: Home fails first, then the departed collector resolves: never 100 on Home', async () => {
  const h = harness(A);
  const seq = await departedCollectorWithHomeRead(h);
  h.rpcs[0].answer();
  await tick();
  await tick();
  assert.equal(h.state.error, true);
  assert.equal(h.core.setKnown(A, 100n, { seq }), false);
  assert.equal(h.state.balance, null);
  assert.equal(h.state.error, true, 'Home\'s error is not cleared by a departed value');
});

test('Pass5-P2: a departed read landing with no destination read pending makes the destination read for itself', async () => {
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

test('Pass5-P2: a same-page ticketed read still commits', () => {
  const h = harness(A);
  const seq = h.core.beginRead(A);
  assert.equal(h.core.setKnown(A, 100n, { seq }), true);
  assert.equal(h.state.balance, 100n);
});
