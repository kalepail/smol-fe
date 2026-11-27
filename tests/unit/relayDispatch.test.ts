import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncDispatchGuardError, RelayError, relayXdr, runDispatchGuard } from '../../src/utils/relayDispatch.ts';

/**
 * FE-1 pass 4, P1: the relayer POST is preceded, in the SAME tick and after
 * the Turnstile token resolves, by the action's synchronous final check. A
 * session change during the (slow, interactive) Turnstile challenge therefore
 * sends nothing.
 */
function harness() {
  const events: string[] = [];
  const sent: { url: string; init?: RequestInit }[] = [];
  let releaseToken!: (token: string) => void;
  const token = new Promise<string>((r) => (releaseToken = r));
  let microtaskSinceGuard = false;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    events.push(`fetch(microtaskSinceGuard=${microtaskSinceGuard})`);
    sent.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  const markGuard = () => {
    microtaskSinceGuard = false;
    queueMicrotask(() => (microtaskSinceGuard = true));
  };
  return { events, sent, releaseToken, token, fetchImpl, markGuard };
}

test('beforeDispatch runs after Turnstile resolves and in the same tick as the POST (zero awaits between)', async () => {
  const h = harness();
  const done = relayXdr({
    xdr: 'AAAA',
    relayerUrl: 'https://relay.test',
    getToken: () => (h.events.push('turnstile'), h.token),
    clearToken: () => h.events.push('clearToken'),
    beforeDispatch: () => {
      h.events.push('beforeDispatch');
      h.markGuard();
    },
    fetchImpl: h.fetchImpl,
  });
  await new Promise((r) => setTimeout(r, 2));
  assert.deepEqual(h.events, ['turnstile'], 'nothing checked or sent while Turnstile is pending');
  h.releaseToken('tok');
  assert.deepEqual(await done, { ok: true });
  assert.deepEqual(h.events, ['turnstile', 'beforeDispatch', 'fetch(microtaskSinceGuard=false)', 'clearToken']);
  assert.equal(h.sent.length, 1);
  assert.equal((h.sent[0].init?.headers as Record<string, string>)['X-Turnstile-Response'], 'tok');
});

test('a session change during Turnstile → beforeDispatch throws → ZERO relay POST, token kept', async () => {
  const h = harness();
  let session = 'A';
  const done = relayXdr({
    xdr: 'AAAA',
    relayerUrl: 'https://relay.test',
    getToken: () => h.token,
    clearToken: () => h.events.push('clearToken'),
    beforeDispatch: () => {
      if (session !== 'A') throw new Error('Nothing was sent');
    },
    fetchImpl: h.fetchImpl,
  });
  session = 'B'; // B signs in while the challenge is open
  h.releaseToken('tok');
  await assert.rejects(done, /Nothing was sent/);
  assert.equal(h.sent.length, 0);
  assert.deepEqual(h.events, [], 'the unused token is not consumed');
});

test('an asynchronous beforeDispatch is refused: nothing sent', async () => {
  const h = harness();
  h.releaseToken('tok');
  await assert.rejects(
    relayXdr({
      xdr: 'AAAA',
      relayerUrl: 'https://relay.test',
      getToken: () => h.token,
      clearToken: () => {},
      beforeDispatch: (async () => {}) as unknown as () => void,
      fetchImpl: h.fetchImpl,
    }),
    (e: unknown) => e instanceof RelayError && e.preDispatch && e.cause instanceof AsyncDispatchGuardError
  );
  assert.equal(h.sent.length, 0);
});

test('no relayer configured: fails before asking Turnstile', async () => {
  let asked = false;
  await assert.rejects(
    relayXdr({ xdr: 'AAAA', relayerUrl: '', getToken: async () => ((asked = true), 't'), clearToken: () => {} }),
    (e: unknown) => e instanceof RelayError && e.preDispatch && e.message === 'Relayer URL not configured'
  );
  assert.equal(asked, false);
});

test('a Turnstile failure is explicitly pre-dispatch', async () => {
  const h = harness();
  const cause = new Error('Turnstile is unavailable');
  await assert.rejects(relayXdr({
    xdr: 'AAAA',
    relayerUrl: 'https://relay.test',
    getToken: async () => { throw cause; },
    clearToken: () => assert.fail('The token must be kept when the POST never ran'),
    fetchImpl: h.fetchImpl,
  }), (e: unknown) => e instanceof RelayError && e.preDispatch && e.cause === cause);
  assert.equal(h.sent.length, 0);
});

test('a relayer rejection preserves its HTTP status and structured error fields', async () => {
  await assert.rejects(relayXdr({
    xdr: 'AAAA',
    relayerUrl: 'https://relay.test',
    getToken: async () => 'token',
    clearToken: () => {},
    fetchImpl: async () => Response.json({ error: 'Turnstile rejected', code: 'turnstile', retryable: false }, { status: 403 }),
  }), {
    name: 'RelayError',
    message: 'Relayer proxy error: Turnstile rejected',
    status: 403,
    preDispatch: false,
    code: 'turnstile',
    retryable: false,
  });
});

test('a timeout at the POST leaves the relay outcome unknown', async () => {
  const cause = new DOMException('Timed out', 'TimeoutError');
  await assert.rejects(relayXdr({
    xdr: 'AAAA',
    relayerUrl: 'https://relay.test',
    getToken: async () => 'token',
    clearToken: () => {},
    fetchImpl: async () => { throw cause; },
  }), (e: unknown) => e instanceof RelayError && !e.preDispatch && e.status === undefined && e.cause === cause);
});

test('runDispatchGuard: sync guards run; thenables are refused; no guard is a no-op', () => {
  let ran = false;
  runDispatchGuard(() => void (ran = true));
  assert.equal(ran, true);
  runDispatchGuard(undefined);
  assert.throws(() => runDispatchGuard((() => Promise.resolve()) as unknown as () => void), AsyncDispatchGuardError);
});
