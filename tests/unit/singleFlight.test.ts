import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlight } from '../../src/utils/singleFlight.ts';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('concurrent connectWallet calls for the same wallet share one in-flight connect', async () => {
  const run = createSingleFlight<void>();
  const gate = deferred();
  let calls = 0;
  const task = async () => {
    calls++;
    await gate.promise;
  };
  const all = Promise.all([run('w|k', task), run('w|k', task), run('w|k', task)]);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 1);
  gate.resolve();
  await all;
  assert.equal(calls, 1);
});

test('a different wallet waits for the in-flight connect, never overlapping it', async () => {
  const run = createSingleFlight<void>();
  const order: string[] = [];
  const gateA = deferred();
  const a = run('A', async () => {
    order.push('A:start');
    await gateA.promise;
    order.push('A:end');
  });
  const b = run('B', async () => {
    order.push('B:start');
  });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, ['A:start']);
  gateA.resolve();
  await Promise.all([a, b]);
  assert.deepEqual(order, ['A:start', 'A:end', 'B:start']);
});

test('a failed connect rejects every joined caller and can be retried', async () => {
  const run = createSingleFlight<void>();
  const gate = deferred();
  let calls = 0;
  const failing = async () => {
    calls++;
    await gate.promise;
    throw new Error('user cancelled passkey');
  };
  const p1 = run('w', failing);
  const p2 = run('w', failing);
  gate.resolve();
  await assert.rejects(p1, /cancelled/);
  await assert.rejects(p2, /cancelled/);
  assert.equal(calls, 1);

  await run('w', async () => {
    calls++;
  });
  assert.equal(calls, 2, 'settled flights are forgotten so a retry runs');
});

test('a different key queued behind a FAILED flight still runs', async () => {
  const run = createSingleFlight<string>();
  const a = run('A', async () => {
    throw new Error('boom');
  });
  const b = run('B', async () => 'b-ok');
  await assert.rejects(a, /boom/);
  assert.equal(await b, 'b-ok');
});
