import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerCoalescer } from '../../src/utils/ledgerCoalescer.ts';
import type { LedgerEntryRead } from '../../src/utils/ledgerReads.ts';

// Report 49 P2-3: a forced Refresh must issue a fresh getLedgerEntries call
// instead of joining an older in-flight read, while ordinary reads still
// coalesce per key and batch per tick.

function harness() {
  const calls: { keys: string[]; resolve: (m: Map<string, LedgerEntryRead>) => void; reject: (e: unknown) => void }[] = [];
  const coalescer = createLedgerCoalescer(
    (keys) => new Promise((resolve, reject) => calls.push({ keys, resolve, reject })),
    { maxPerCall: 3 }
  );
  const answer = (i: number, value: string) =>
    calls[i].resolve(new Map(calls[i].keys.map((k) => [k, { state: 'missing', note: `${k}:${value}` } as unknown as LedgerEntryRead])));
  return { coalescer, calls, answer };
}

const tick = () => new Promise((r) => setImmediate(r));

test('same-tick keys share one call and split at maxPerCall', async () => {
  const h = harness();
  for (const k of ['a', 'b', 'c', 'd']) void h.coalescer.read(k);
  await tick();
  assert.deepEqual(h.calls.map((c) => c.keys), [['a', 'b', 'c'], ['d']]);
});

test('a plain read joins the in-flight request for the same key', async () => {
  const h = harness();
  const first = h.coalescer.read('kale');
  await tick();
  const second = h.coalescer.read('kale');
  await tick();
  assert.equal(h.calls.length, 1);
  h.answer(0, 'old');
  assert.equal(await first, await second);
});

test('a fresh read never joins an already-sent request', async () => {
  const h = harness();
  const older = h.coalescer.read('kale');
  await tick();
  const fresh = h.coalescer.read('kale', { fresh: true });
  await tick();
  assert.equal(h.calls.length, 2, 'Refresh issues its own RPC');
  // Later plain readers join the newest request.
  const joiner = h.coalescer.read('kale');
  h.answer(1, 'new');
  h.answer(0, 'old');
  const [o, f, j] = (await Promise.all([older, fresh, joiner])) as unknown as { note: string }[];
  assert.equal(o.note, 'kale:old');
  assert.equal(f.note, 'kale:new');
  assert.equal(j.note, 'kale:new');
});

test('an older request settling does not evict the newer fresh one', async () => {
  const h = harness();
  void h.coalescer.read('kale');
  await tick();
  void h.coalescer.read('kale', { fresh: true });
  await tick();
  h.answer(0, 'old');
  await tick();
  void h.coalescer.read('kale');
  await tick();
  assert.equal(h.calls.length, 2, 'still joined the pending fresh request');
});

test('a fresh read joins a request that has not been sent yet', async () => {
  const h = harness();
  void h.coalescer.read('kale');
  void h.coalescer.read('kale', { fresh: true });
  await tick();
  assert.equal(h.calls.length, 1);
});

test('a transport failure resolves every key as error (never a value)', async () => {
  const h = harness();
  const read = h.coalescer.read('kale');
  await tick();
  h.calls[0].reject(new Error('upstream unavailable'));
  assert.deepEqual(await read, { state: 'error', error: 'upstream unavailable' });
});

test('Report 49 Pass 2: a read in a later wallet session never joins a request sent in an earlier one', async () => {
  let session = 0;
  const calls: { keys: string[]; resolve: (m: Map<string, LedgerEntryRead>) => void }[] = [];
  const coalescer = createLedgerCoalescer(
    (keys) => new Promise((resolve) => calls.push({ keys, resolve })),
    { maxPerCall: 3, session: () => session }
  );
  const before = coalescer.read('kale');
  await tick();
  session++; // wallet switch A→B→A
  const after = coalescer.read('kale');
  const joined = coalescer.read('kale'); // same session, same tick: joins
  await tick();
  assert.equal(calls.length, 2, 'a new request for the new session');
  assert.equal(after, joined);
  calls[1].resolve(new Map([['kale', { state: 'missing', note: 'new' } as unknown as LedgerEntryRead]]));
  calls[0].resolve(new Map([['kale', { state: 'missing', note: 'old' } as unknown as LedgerEntryRead]]));
  assert.equal(((await after) as unknown as { note: string }).note, 'new');
  assert.equal(((await before) as unknown as { note: string }).note, 'old');
});

test('Report 49 Pass 2: a key still queued (not sent) is joined across a session bump', async () => {
  let session = 0;
  const calls: { keys: string[] }[] = [];
  const coalescer = createLedgerCoalescer(
    (keys) => new Promise(() => calls.push({ keys })),
    { maxPerCall: 3, session: () => session }
  );
  const a = coalescer.read('kale');
  session++;
  const b = coalescer.read('kale');
  await tick();
  assert.equal(a, b);
  assert.equal(calls.length, 1);
});
