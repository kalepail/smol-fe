import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_SUPERSEDED_COPY,
  ACTION_SUPERSEDED_UNSENT_COPY,
  createWalletSession,
  SESSION_CHANGED_COPY,
  WalletActionSupersededError,
  type WalletActionTicket,
  SIGNED_OUT_COPY,
  WalletSessionError,
  type PasskeySingleton,
  type WalletIdentity,
} from '../../src/utils/walletSession.ts';

/**
 * FE-1 pass 2, P1: an old restore must never overwrite (or be returned as) a
 * newer login's signer. The fake singleton mirrors passkey-kit 0.12: every
 * `connectWallet` overwrites `wallet` at the END, and `keyId` is only set on
 * the first connect.
 */
const A = { contractId: 'CA_WALLET_A', keyId: 'key-A' };
const B = { contractId: 'CB_WALLET_B', keyId: 'key-B' };
const CONTRACT_OF: Record<string, string> = { 'key-A': A.contractId, 'key-B': B.contractId };

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

function harness() {
  const identity: WalletIdentity = { contractId: null, keyId: null, generation: 0 };
  const holds = new Map<string, Promise<void>>();
  const connects: string[] = [];
  const account: PasskeySingleton & { interactiveKey?: string } = {
    keyId: undefined,
    wallet: undefined,
    async connectWallet(opts: { keyId?: string }) {
      const keyId = opts.keyId ?? account.interactiveKey!;
      connects.push(opts.keyId ? `restore:${keyId}` : `interactive:${keyId}`);
      await holds.get(keyId);
      if (!account.keyId) account.keyId = keyId; // passkey-kit: first connect only
      const contractId = CONTRACT_OF[keyId];
      account.wallet = { options: { contractId } };
      return { contractId };
    },
  };
  const mod = { account };
  const bindings: Array<string | null> = [];
  const session = createWalletSession({
    load: async () => mod,
    identity: () => ({ ...identity }),
    rpId: () => 'smol.xyz',
    onBindingChange: (b) => bindings.push(b ? b.contractId : null),
  });

  /** What useAuthentication.login() does, with the real ordering. */
  async function login(who: typeof A) {
    const ticket = session.invalidate();
    account.interactiveKey = who.keyId;
    const { contractId } = await account.connectWallet({});
    identity.contractId = contractId;
    identity.keyId = who.keyId;
    identity.generation = (identity.generation ?? 0) + 1; // setUserAuth bumps the generation
    return session.bindInteractive(mod, ticket, contractId, who.keyId);
  }

  return { identity, holds, connects, account, mod, session, bindings, login };
}

test('held restore for A → B logs in → A released: getConnected() returns B\'s signer, never A\'s', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const holdA = gate();
  h.holds.set('key-A', holdA.promise);

  const restoreA = h.session.getConnected(); // A's on-demand restore, held at the RPC
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.connects, ['restore:key-A']);

  assert.equal(await h.login(B), true, 'B login binds immediately');
  assert.equal(h.account.wallet?.options.contractId, B.contractId);

  holdA.open(); // A's stale connect resolves and OVERWRITES the singleton with A
  const fromA = await restoreA;
  // The in-flight caller gets the CURRENT session's signer (B), re-connected.
  assert.equal(fromA.account.wallet?.options.contractId, B.contractId);
  assert.equal(fromA.account.keyId, B.keyId);

  const next = await h.session.getConnected();
  assert.equal(next.account.wallet?.options.contractId, B.contractId);
  assert.equal(next.account.keyId, B.keyId);
  assert.deepEqual(h.connects, ['restore:key-A', 'interactive:key-B', 'restore:key-B']);
  assert.deepEqual(h.session.binding(), { ...B, epoch: 1, current: true });
  // Signing with A's key is refused; B's key is accepted.
  assert.throws(() => h.session.assertSigner(next, A.keyId), WalletSessionError);
  h.session.assertSigner(next, B.keyId);
});

test('a stale restore resolving AFTER B was bound is detected (singleton verified, not just the flag)', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const holdA = gate();
  h.holds.set('key-A', holdA.promise);
  const restoreA = h.session.getConnected().catch((e) => e);
  await new Promise((r) => setImmediate(r));
  await h.login(B);

  // B is bound and returned while A's connect is still in flight.
  const early = await h.session.getConnected();
  assert.equal(early.account.wallet?.options.contractId, B.contractId);

  const holdB = gate();
  h.holds.set('key-B', holdB.promise); // hold B's re-connect to observe the window
  holdA.open(); // now A overwrites the singleton AFTER B was returned
  while (!h.connects.includes('restore:key-B')) await new Promise((r) => setImmediate(r));
  // The stale connect really did overwrite the singleton with A…
  assert.equal(h.account.wallet?.options.contractId, A.contractId);
  // …so signing with the earlier-returned handle refuses (verified at sign time).
  assert.throws(() => h.session.assertSigner(early, B.keyId), (e: unknown) => e instanceof WalletSessionError && e.message === SESSION_CHANGED_COPY);
  // The in-flight caller re-connects B (never returns A), and so does the next one.
  holdB.open();
  assert.equal((await restoreA).account?.wallet?.options.contractId, B.contractId);
  const next = await h.session.getConnected();
  assert.equal(next.account.wallet?.options.contractId, B.contractId);
  h.session.assertSigner(next, B.keyId);
});

test('logout during A\'s restore: nothing is returned for A, the singleton is cleared', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const holdA = gate();
  h.holds.set('key-A', holdA.promise);
  const restoreA = h.session.getConnected().then(
    () => 'resolved',
    (e: Error) => e.message
  );
  await new Promise((r) => setImmediate(r));

  h.session.signOut();
  h.identity.contractId = null;
  h.identity.keyId = null;
  holdA.open();
  assert.equal(await restoreA, SIGNED_OUT_COPY);
  assert.equal(h.session.binding(), null);
  await assert.rejects(h.session.getConnected(), (e: unknown) => e instanceof WalletSessionError);
});

test('cross-tab switch (identity changes without login): A\'s result is discarded, B connected', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const holdA = gate();
  h.holds.set('key-A', holdA.promise);
  const restoreA = h.session.getConnected();
  await new Promise((r) => setImmediate(r));
  Object.assign(h.identity, B); // syncUserAuthFromCookie: no epoch bump
  holdA.open();
  const mod = await restoreA;
  assert.equal(mod.account.wallet?.options.contractId, B.contractId);
  assert.deepEqual(h.connects, ['restore:key-A', 'restore:key-B']);
});

test('concurrent callers for the same wallet share ONE connect; a bound wallet is reused', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const [x, y, z] = await Promise.all([h.session.getConnected(), h.session.getConnected(), h.session.getConnected()]);
  assert.equal(x, y);
  assert.equal(y, z);
  await h.session.getConnected();
  assert.deepEqual(h.connects, ['restore:key-A']);
  assert.deepEqual(h.bindings, [A.contractId]);
});

test('passkey-kit keyId is pinned to the bound session (it only sets keyId on the first connect)', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  await h.session.getConnected();
  assert.equal(h.account.keyId, A.keyId);
  Object.assign(h.identity, B);
  const mod = await h.session.getConnected();
  assert.equal(mod.account.keyId, B.keyId, 'not left at the first connect\'s key');
});

test('a passkey that derives a different wallet than the session is refused', async () => {
  const h = harness();
  h.identity.contractId = 'C_SOME_OTHER_WALLET';
  h.identity.keyId = A.keyId;
  await assert.rejects(h.session.getConnected(), /different wallet/);
  assert.equal(h.session.binding(), null);
});

test('an interactive login overtaken by another transition is not bound', async () => {
  const h = harness();
  const ticket = h.session.invalidate();
  h.account.interactiveKey = A.keyId;
  await h.account.connectWallet({});
  h.session.invalidate(); // e.g. logout raced the login
  assert.equal(h.session.bindInteractive(h.mod, ticket, A.contractId, A.keyId), false);
  assert.equal(h.session.binding(), null);
});

// ---------------------------------------------------------------------------
// FE-1 pass 3, P1: a pending action (KALE transfer, swap, batch buy, mint)
// must never switch senders when the session changes under it.
// ---------------------------------------------------------------------------

/** Account.svelte's transfer order, with every boundary counted. */
async function transferKale(
  h: ReturnType<typeof harness>,
  session: WalletActionTicket,
  log: string[]
): Promise<string> {
  try {
    const mod = await h.session.getConnected(session);
    h.session.assertTicket(session); // before building
    log.push(`build:from=${session.contractId}`);
    h.session.assertSigner(mod, session.keyId, session); // signWithPasskey, before the prompt
    log.push(`sign:${mod.account.wallet?.options.contractId}`);
    h.session.assertTicket(session); // before relaying
    log.push('relay');
    return 'sent';
  } catch (e) {
    return (e as Error).name;
  }
}

const ticketOf = (h: ReturnType<typeof harness>): WalletActionTicket => ({
  contractId: h.identity.contractId!,
  keyId: h.identity.keyId!,
  generation: h.identity.generation ?? 0,
});

test('pass 3 P1: 1 KALE transfer under A → A restore held → B logs in → A released: aborted, nothing built/signed/relayed', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const holdA = gate();
  h.holds.set('key-A', holdA.promise);
  const log: string[] = [];

  const session = ticketOf(h); // captured synchronously at submit
  const pending = transferKale(h, session, log);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.connects, ['restore:key-A']);

  assert.equal(await h.login(B), true); // B completes its login
  holdA.open(); // A's restore resolves
  assert.equal(await pending, 'WalletActionSupersededError');
  assert.deepEqual(log, [], 'zero tx built, signed or relayed');
  // It never restored (or prompted) B on A's behalf.
  assert.deepEqual(h.connects, ['restore:key-A', 'interactive:key-B']);
  // B's own next action works with B.
  const okLog: string[] = [];
  assert.equal(await transferKale(h, ticketOf(h), okLog), 'sent');
  assert.deepEqual(okLog, [`build:from=${B.contractId}`, `sign:${B.contractId}`, 'relay']);
});

test('pass 3 P1: a switch after the wallet is ready aborts before the prompt, or before the relay', async () => {
  // Switch between "wallet ready" and the passkey prompt: never prompts.
  {
    const h = harness();
    Object.assign(h.identity, A);
    const session = ticketOf(h);
    const mod = await h.session.getConnected(session);
    await h.login(B);
    assert.throws(() => h.session.assertSigner(mod, session.keyId, session), WalletActionSupersededError);
  }
  // Switch between the signature and the relay: never relays.
  {
    const h = harness();
    Object.assign(h.identity, A);
    const session = ticketOf(h);
    const mod = await h.session.getConnected(session);
    h.session.assertSigner(mod, session.keyId, session); // signed as A
    await h.login(B);
    assert.throws(
      () => h.session.assertTicket(session),
      (e: unknown) => e instanceof WalletActionSupersededError && (e as Error).message === ACTION_SUPERSEDED_COPY
    );
  }
});

test('pass 4 P1: a switch AFTER the signature reports that nothing was sent', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const session = ticketOf(h);
  const mod = await h.session.getConnected(session);
  h.session.assertSigner(mod, session.keyId, session); // signed as A
  h.session.assertTicket(session, 'after-sign'); // still A: passes
  await h.login(B); // B signs in while Turnstile is open
  assert.throws(
    () => h.session.assertTicket(session, 'after-sign'),
    (e: unknown) =>
      e instanceof WalletActionSupersededError &&
      e.stage === 'after-sign' &&
      e.message === ACTION_SUPERSEDED_UNSENT_COPY &&
      /Nothing was sent/.test(e.message) &&
      !/signed/i.test(e.message)
  );
});

test('pass 3 P1: same wallet, new generation (A → logout → A) still aborts the old action', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const session = ticketOf(h);
  await h.session.getConnected(session);
  await h.login(A); // re-login as the SAME wallet: new generation
  assert.equal(h.session.isTicketCurrent(session), false);
  await assert.rejects(h.session.getConnected(session), WalletActionSupersededError);
  // A ticket for the new generation works.
  await h.session.getConnected(ticketOf(h));
});

test('pass 3 P1: logout during a ticketed restore aborts without connecting anyone', async () => {
  const h = harness();
  Object.assign(h.identity, A);
  const holdA = gate();
  h.holds.set('key-A', holdA.promise);
  const session = ticketOf(h);
  const pending = h.session.getConnected(session).then(
    () => 'returned',
    (e: Error) => e.name
  );
  await new Promise((r) => setImmediate(r));
  h.session.signOut();
  Object.assign(h.identity, { contractId: null, keyId: null, generation: (h.identity.generation ?? 0) + 1 });
  holdA.open();
  assert.equal(await pending, 'WalletActionSupersededError');
  assert.deepEqual(h.connects, ['restore:key-A']);
});
