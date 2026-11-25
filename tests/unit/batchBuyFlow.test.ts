import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGuardedBatchBuy } from '../../src/utils/batchBuyFlow.ts';
import { QuoteMovedError } from '../../src/utils/slippage.ts';

/**
 * FE-1 pass 2, P1: the batch buy's final 2% price check must run AFTER the
 * (slow) wallet restoration, and signing must reuse that prepared wallet.
 * A pool that drops 5% while the wallet restores aborts before any signature
 * or relay.
 */
function run(opts: { poolDuringRestore: bigint }) {
  const events: string[] = [];
  let pool = 100n; // aggregate token quote
  const wallet = { id: 'prepared-wallet' };
  const done = runGuardedBatchBuy<{ tx: true }, typeof wallet>({
    quote: async (phase) => {
      events.push(`quote:${phase}=${pool}`);
      return pool;
    },
    assemble: async () => {
      events.push('assemble');
      return { tx: true };
    },
    expiration: async () => {
      events.push('expiration');
      return 66_000_000;
    },
    prepareWallet: async () => {
      events.push('prepareWallet:start');
      await new Promise((r) => setTimeout(r, 5));
      pool = opts.poolDuringRestore; // the market moves while the wallet restores
      events.push('prepareWallet:done');
      return wallet;
    },
    sign: async (_tx, w, expiration) => {
      assert.equal(w, wallet, 'signs with the prepared wallet (no second restore)');
      events.push(`sign@${expiration}`);
    },
    beforeSubmit: ({ expiresAtLedger }) => {
      events.push(`beforeSubmit@${expiresAtLedger}`);
    },
    relay: async (_tx, w, beforeDispatch) => {
      assert.equal(w, wallet);
      events.push('relay:turnstile');
      await new Promise((r) => setTimeout(r, 1)); // the relay's own async prerequisite
      beforeDispatch();
      events.push('relay:POST');
    },
  });
  return { done, events };
}

test('a 5% pool drop DURING wallet restoration aborts before signing (nothing signed or relayed)', async () => {
  const { done, events } = run({ poolDuringRestore: 95n });
  await assert.rejects(done, (error: unknown) => {
    assert.ok(error instanceof QuoteMovedError);
    assert.equal(error.issue, 'moved');
    assert.equal(error.baseline, 100n);
    assert.equal(error.requote, 95n);
    assert.equal(error.movedBps, 500n);
    return true;
  });
  assert.deepEqual(events, [
    'quote:baseline=100',
    'assemble',
    'expiration',
    'prepareWallet:start',
    'prepareWallet:done',
    'quote:requote=95',
  ]);
});

test('the final re-quote is taken after the wallet is ready; ≤ 2% proceeds to one sign + relay', async () => {
  const { done, events } = run({ poolDuringRestore: 98n });
  await done;
  assert.deepEqual(events, [
    'quote:baseline=100',
    'assemble',
    'expiration',
    'prepareWallet:start',
    'prepareWallet:done',
    'quote:requote=98',
    'sign@66000000',
    'relay:turnstile',
    'beforeSubmit@66000000',
    'relay:POST',
  ]);
});

test('a failed wallet restoration aborts before the re-quote, signature and relay', async () => {
  const events: string[] = [];
  await assert.rejects(
    runGuardedBatchBuy({
      quote: async (phase) => (events.push(`quote:${phase}`), 100n),
      assemble: async () => events.push('assemble'),
      expiration: async () => 1,
      prepareWallet: async () => {
        throw new Error('Failed to connect wallet');
      },
      sign: async () => void events.push('sign'),
      beforeSubmit: () => void events.push('beforeSubmit'),
      relay: async () => void events.push('relay'),
    }),
    /Failed to connect wallet/
  );
  assert.deepEqual(events, ['quote:baseline', 'assemble']);
});

test('no baseline quote fails closed before assembling', async () => {
  let assembled = false;
  await assert.rejects(
    runGuardedBatchBuy({
      quote: async () => null,
      assemble: async () => (assembled = true),
      expiration: async () => 1,
      prepareWallet: async () => null,
      sign: async () => assert.fail('signed'),
      beforeSubmit: () => assert.fail('submitted'),
      relay: async () => assert.fail('relayed'),
    }),
    (error: unknown) => error instanceof QuoteMovedError && error.issue === 'unavailable'
  );
  assert.equal(assembled, false);
});

// ---------------------------------------------------------------------------
// FE-1 pass 4, P1: `submitting` is recorded only inside the relay's synchronous
// pre-dispatch guard (after Turnstile), never while the relay still waits.
// ---------------------------------------------------------------------------

function heldRelay() {
  const events: string[] = [];
  const persisted: string[] = [];
  const posts: string[] = [];
  let session = 'A';
  let releaseTurnstile!: () => void;
  const turnstile = new Promise<void>((r) => (releaseTurnstile = r));
  const done = runGuardedBatchBuy<{ tx: true }, null>({
    quote: async () => 100n,
    assemble: async () => ({ tx: true }),
    expiration: async () => 66_000_000,
    prepareWallet: async () => null,
    sign: async () => void events.push('sign'),
    beforeSubmit: () => {
      // The store's guard: ownership, then the durable `submitting` record.
      persisted.push('submitting');
    },
    relay: async (_tx, _w, beforeDispatch) => {
      events.push('turnstile:held');
      await turnstile;
      // The ticket assertion the hook wraps around the store's guard.
      const guard = () => {
        if (session !== 'A') throw new Error('Your account changed before this could be sent, so it was cancelled. Nothing was sent.');
        beforeDispatch();
        if (session !== 'A') throw new Error('changed during the guard');
      };
      guard();
      posts.push('relay'); // same tick as the guard
    },
  });
  return {
    done,
    events,
    persisted,
    posts,
    loginAs: (who: string) => (session = who),
    releaseTurnstile: () => releaseTurnstile(),
  };
}

test('batch buy held at Turnstile: `submitting` is NOT recorded while the relay waits', async () => {
  const run = heldRelay();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(run.events, ['sign', 'turnstile:held']);
  assert.deepEqual(run.persisted, [], 'nothing persisted before Turnstile completes');
  run.releaseTurnstile();
  await run.done;
  assert.deepEqual(run.persisted, ['submitting']);
  assert.deepEqual(run.posts, ['relay']);
});

test('batch buy held at Turnstile → B logs in → Turnstile releases: ZERO relay POST, `submitting` never recorded', async () => {
  const run = heldRelay();
  await new Promise((r) => setTimeout(r, 5));
  run.loginAs('B');
  run.releaseTurnstile();
  await assert.rejects(run.done, /Nothing was sent/);
  assert.deepEqual(run.posts, []);
  assert.deepEqual(run.persisted, []);
});

test('an asynchronous beforeSubmit is refused before the POST', async () => {
  const posts: string[] = [];
  await assert.rejects(
    runGuardedBatchBuy<{ tx: true }, null>({
      quote: async () => 100n,
      assemble: async () => ({ tx: true }),
      expiration: async () => 1,
      prepareWallet: async () => null,
      sign: async () => {},
      // A promise-returning guard could let the session change before it settles.
      beforeSubmit: async () => {},
      relay: async (_tx, _w, beforeDispatch) => {
        beforeDispatch();
        posts.push('relay');
      },
    }),
    /must be synchronous/
  );
  assert.deepEqual(posts, []);
});
