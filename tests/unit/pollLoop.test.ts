import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollUntilSettled } from '../../src/utils/pollLoop.ts';

const instantSleep = (_ms: number, signal: AbortSignal) =>
  signal.aborted ? Promise.reject(new DOMException('Aborted', 'AbortError')) : Promise.resolve();

test('#10 an abort during a slow read never publishes onSettled', async () => {
  const controller = new AbortController();
  const settled: string[][] = [];
  let release!: () => void;
  const run = pollUntilSettled({
    ids: ['a'],
    signal: controller.signal,
    deadline: Date.now() + 60_000,
    sleep: instantSleep,
    read: () =>
      new Promise((resolve) => {
        release = () => resolve(new Map([['a', 'settled']]));
      }),
    onSettled: (ids) => settled.push(ids),
  });
  await new Promise((r) => setTimeout(r, 0));
  controller.abort();
  release();
  await assert.rejects(run);
  assert.deepEqual(settled, [], 'aborted loop is silent');
});

test('settles ids across ticks, stops at the deadline, and survives a failed tick', async () => {
  const controller = new AbortController();
  const settled: string[] = [];
  let tick = 0;
  const { remaining } = await pollUntilSettled({
    ids: ['a', 'b', 'c'],
    signal: controller.signal,
    deadline: Date.now() + 60_000,
    sleep: instantSleep,
    read: async () => {
      tick++;
      if (tick === 1) throw new Error('rpc blip');
      if (tick === 2) return new Map([['a', 'settled']]);
      return new Map([['b', 'settled'], ['c', 'failed']]);
    },
    onSettled: (ids) => settled.push(...ids),
  });
  assert.deepEqual(settled, ['a', 'b']);
  assert.deepEqual(remaining, []);

  const timedOut = await pollUntilSettled({
    ids: ['x'],
    signal: new AbortController().signal,
    deadline: 0,
    sleep: instantSleep,
    read: async () => new Map(),
    onSettled: () => assert.fail('nothing settles'),
  });
  assert.deepEqual(timedOut.remaining, ['x']);
});
