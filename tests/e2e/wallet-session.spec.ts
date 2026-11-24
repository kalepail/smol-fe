import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { hash, StrKey } from '@stellar/stellar-sdk';
import { COLLECTOR, CREATOR } from '../fixtures/collect.mjs';
import { installStellarMock } from './helpers/stellarMock';
import { ACTION_SUPERSEDED_COPY, ACTION_SUPERSEDED_UNSENT_COPY } from '../../src/utils/walletSession.ts';

// Wallet session safety: an old wallet restore must never overwrite (or be
// returned as) a newer login's signer, and a wallet action started for one
// account never builds, signs or relays for another. Drives the REAL src/utils/wallet.ts,
// src/hooks/useAuthentication.ts login() and the REAL passkey-kit singleton in
// the browser; only `account.connectWallet` (WebAuthn + RPC probe) is replaced
// by a controllable stand-in that mutates the singleton exactly like passkey-kit
// 0.12 does (`wallet` overwritten at the end, `keyId` set on first connect only).
const WALLET_B = StrKey.encodeContract(hash(Buffer.from('smol-e2e-collector-b')));
const KEY_A = 'fixture-key-1';
const KEY_B = 'fixture-key-b';
const API_URL = 'http://127.0.0.1:4329';
const RELAYER = /^https:\/\/api\.kalefarm\.xyz\//;
const KALE = (n: number) => BigInt(n) * 10_000_000n;

function fakeJwt(sub: string, key: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, key, exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
    'base64url'
  );
  return `${header}.${payload}.sig`;
}

test('held restore for A → B logs in → A released: getConnectedAccount() returns B\'s signer, never A\'s', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(COLLECTOR, KEY_A), url: 'http://127.0.0.1:4328' }]);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Open account menu/i })).toBeVisible({ timeout: 15_000 });

  const result = await page.evaluate(
    async ({ A, B, KEY_A, KEY_B }) => {
      // Vite dev serves source modules: the SAME instances the app uses.
      const load = (p: string) => import(/* @vite-ignore */ p);
      const kit = await load('/src/utils/passkey-kit.ts');
      const wallet = await load('/src/utils/wallet.ts');
      const { userState } = await load('/src/stores/user.svelte.ts');
      const { useAuthentication } = await load('/src/hooks/useAuthentication.ts');
      const account = kit.account as {
        keyId?: string;
        wallet?: { options: { contractId: string } };
        connectWallet: (opts?: { keyId?: string }) => Promise<unknown>;
      };

      const log: string[] = [];
      let releaseA!: () => void;
      const heldA = new Promise<void>((r) => (releaseA = r));
      account.connectWallet = async (opts?: { keyId?: string }) => {
        const keyId = opts?.keyId ?? KEY_B; // interactive login picks passkey B
        log.push(opts?.keyId ? `restore:${keyId}` : `interactive:${keyId}`);
        if (keyId === KEY_A) await heldA;
        const contractId = keyId === KEY_A ? A : B;
        if (!account.keyId) account.keyId = keyId; // passkey-kit 0.12: first connect only
        account.wallet = { options: { contractId } }; // overwritten at the END, like passkey-kit
        return { rawResponse: { id: keyId, response: {} }, keyId: new Uint8Array(), keyIdBase64: keyId, contractId };
      };

      const before = { contractId: userState.contractId, keyId: userState.keyId };
      // 1. A's on-demand restore starts and is held at the RPC probe.
      const restoreA = wallet.getConnectedAccount().then(
        (m: typeof kit) => ({ ok: true, contractId: m.account.wallet?.options.contractId, keyId: m.account.keyId }),
        (e: Error) => ({ ok: false, error: e.message })
      );
      while (!log.includes(`restore:${KEY_A}`)) await new Promise((r) => setTimeout(r, 5));

      // 2. B logs in interactively (real login(): POST /login, cookie, userState).
      await useAuthentication().login();
      const afterLogin = { contractId: userState.contractId, keyId: userState.keyId };

      // 3. A's stale restore resolves (and overwrites the singleton with A).
      releaseA();
      const fromA = await restoreA;

      // 4. Every subsequent caller gets B's signer.
      const next = await wallet.getConnectedAccount();
      const signerAfter = { contractId: next.account.wallet?.options.contractId, keyId: next.account.keyId };
      let signWithA = 'allowed';
      try {
        wallet.assertWalletSigner(next, KEY_A);
      } catch (e) {
        signWithA = (e as Error).name;
      }
      wallet.assertWalletSigner(next, KEY_B);
      return { before, afterLogin, fromA, signerAfter, signWithA, log };
    },
    { A: COLLECTOR, B: WALLET_B, KEY_A, KEY_B }
  );

  expect(result.before).toEqual({ contractId: COLLECTOR, keyId: KEY_A });
  expect(result.afterLogin).toEqual({ contractId: WALLET_B, keyId: KEY_B });
  // The caller that asked during A's restore is handed the CURRENT session's signer (B).
  expect(result.fromA).toEqual({ ok: true, contractId: WALLET_B, keyId: KEY_B });
  expect(result.signerAfter).toEqual({ contractId: WALLET_B, keyId: KEY_B });
  expect(result.signWithA).toBe('WalletSessionError');
  // A's stale result overwrote the singleton, so B was re-connected (never returned as A).
  expect(result.log).toEqual([`restore:${KEY_A}`, `interactive:${KEY_B}`, `restore:${KEY_B}`]);
  expect(errors).toEqual([]);
});

test('logout during a held restore: the restore never yields a signer', async ({ page, context }) => {
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(COLLECTOR, KEY_A), url: 'http://127.0.0.1:4328' }]);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Open account menu/i })).toBeVisible({ timeout: 15_000 });
  const outcome = await page.evaluate(
    async ({ A, KEY_A }) => {
      const load = (p: string) => import(/* @vite-ignore */ p);
      const kit = await load('/src/utils/passkey-kit.ts');
      const wallet = await load('/src/utils/wallet.ts');
      const account = kit.account as {
        keyId?: string;
        wallet?: { options: { contractId: string } };
        connectWallet: (opts?: { keyId?: string }) => Promise<unknown>;
      };
      let releaseA!: () => void;
      const heldA = new Promise<void>((r) => (releaseA = r));
      let started = false;
      account.connectWallet = async () => {
        started = true;
        await heldA;
        account.keyId ??= KEY_A;
        account.wallet = { options: { contractId: A } };
        return { contractId: A };
      };
      const restoreA = wallet.getConnectedAccount().then(
        () => 'returned a signer',
        (e: Error) => `${e.name}: ${e.message}`
      );
      while (!started) await new Promise((r) => setTimeout(r, 5));
      // Same order as useAuthentication().logout() (minus its navigation):
      // signOutWallet(), clearUserAuth(), then the session cookie is removed.
      const { clearUserAuth } = await load('/src/stores/user.svelte.ts');
      const { removeCookie } = await load('/src/utils/cookies.ts');
      wallet.signOutWallet();
      clearUserAuth();
      removeCookie('smol_token', { path: '/' });
      releaseA();
      return restoreA;
    },
    { A: COLLECTOR, KEY_A }
  );
  expect(outcome).toBe('WalletSessionError: Sign in to continue.');
});

// ---------------------------------------------------------------------------
// Pending wallet actions abort (unsigned / unsent) when the session changes
// ---------------------------------------------------------------------------

async function signInAs(context: BrowserContext, sub: string, key: string) {
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(sub, key), url: 'http://127.0.0.1:4328' }]);
}

/** Relayer POSTs the page sent (never the real network). */
async function trackRelayer(page: Page, status = 500) {
  const relayed: string[] = [];
  await page.route(RELAYER, async (route) => {
    relayed.push(route.request().postData() ?? '');
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: status === 200 ? '{}' : '"e2e: relay reached"',
    });
  });
  return relayed;
}

/** Cloudflare Turnstile stand-in: the challenge stays open until `window.__turnstile.release()`. */
async function installHeldTurnstile(page: Page) {
  await page.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `(() => {
        const t = { rendered: 0, release: null };
        window.__turnstile = t;
        window.turnstile = {
          ready(cb) { cb(); },
          render(_el, opts) {
            t.rendered++;
            t.release = () => opts.callback('e2e-turnstile-token');
            return 'e2e-widget';
          },
          reset() {},
          remove() {},
        };
      })();`,
    })
  );
}
const turnstileRendered = (page: Page) =>
  page.evaluate(() => (window as unknown as { __turnstile?: { rendered: number } }).__turnstile?.rendered ?? 0);

/**
 * Replace the passkey boundary of the REAL passkey-kit singleton: restores
 * (`keyId` given) and interactive connects are scripted and can be held. A
 * KALE transfer builds a stand-in tx whose auth entries "sign" without a real
 * prompt (both counted), so the flow reaches Turnstile + relay like a real one.
 */
async function installPasskeyBoundary(page: Page, opts: { interactive: string[]; hold?: string[] }) {
  await page.evaluate(
    async ({ A, B, KEY_A, KEY_B, interactive, hold }) => {
      const kit = await import(/* @vite-ignore */ String('/src/utils/passkey-kit.ts'));
      const account = kit.account as unknown as {
        keyId?: string;
        wallet?: { options: { contractId: string } };
        connectWallet: (o?: { keyId?: string }) => Promise<unknown>;
      };
      const contractOf: Record<string, string> = { [KEY_A]: A, [KEY_B]: B };
      const holds = new Map<string, { promise: Promise<void>; open: () => void }>();
      for (const name of hold) {
        let open!: () => void;
        const promise = new Promise<void>((r) => (open = r));
        holds.set(name, { promise, open });
      }
      const boundary = {
        log: [] as string[],
        built: [] as string[],
        signed: [] as string[],
        release: (name: string) => holds.get(name)?.open(),
      };
      (window as unknown as { __passkey: typeof boundary }).__passkey = boundary;
      const queue = [...interactive];
      account.connectWallet = async (o?: { keyId?: string }) => {
        const keyId = o?.keyId ?? queue.shift()!;
        const name = o?.keyId ? `restore:${keyId}` : `interactive:${keyId}`;
        boundary.log.push(name);
        await holds.get(name)?.promise;
        const contractId = contractOf[keyId];
        if (!account.keyId) account.keyId = keyId;
        account.wallet = { options: { contractId } };
        return { rawResponse: { id: keyId, response: {} }, keyId: new Uint8Array(), keyIdBase64: keyId, contractId };
      };
      const kale = kit.kale as unknown as { transfer: (args: { from: string }) => Promise<unknown> };
      kale.transfer = async (args) => {
        boundary.built.push(args.from);
        return {
          signAuthEntries: async () => {
            boundary.signed.push(account.wallet?.options.contractId ?? '?');
          },
          toXDR: () => `e2e-transfer-from-${args.from}`,
        };
      };
    },
    { A: COLLECTOR, B: WALLET_B, KEY_A, KEY_B, interactive: opts.interactive, hold: opts.hold ?? [] }
  );
}

const passkey = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __passkey: { log: string[]; built: string[]; signed: string[] } }).__passkey;
    return { log: [...s.log], built: [...s.built], signed: [...s.signed] };
  });

async function loginBNow(page: Page) {
  return page.evaluate(async () => {
    const { useAuthentication } = await import(/* @vite-ignore */ String('/src/hooks/useAuthentication.ts'));
    const { userState } = await import(/* @vite-ignore */ String('/src/stores/user.svelte.ts'));
    const outcome = await useAuthentication().login();
    return { outcome, contractId: userState.contractId, keyId: userState.keyId };
  });
}

async function openAccount(page: Page, context: BrowserContext) {
  await signInAs(context, COLLECTOR, KEY_A);
  await installStellarMock(page, () => ({ minted: [], balances: {}, kale: KALE(50), kaleByHolder: { [COLLECTOR]: KALE(100) } }));
  await page.goto('/account');
  await expect(page.locator('[data-account-balance]')).toHaveText('100 KALE', { timeout: 15_000 });
}

async function submitTransfer(page: Page) {
  await page.locator('#account-to').fill(CREATOR);
  await page.locator('#account-amount').fill('1');
  await page.getByRole('button', { name: 'Send KALE' }).click();
}

test('transfer under A → A restore held → B logs in → released: nothing built, signed or relayed', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const relayed = await trackRelayer(page);
  await openAccount(page, context);
  await installPasskeyBoundary(page, { interactive: [KEY_B], hold: [`restore:${KEY_A}`] });

  await submitTransfer(page);
  await expect.poll(async () => (await passkey(page)).log, { timeout: 10_000 }).toContain(`restore:${KEY_A}`);
  expect(await loginBNow(page)).toEqual({ outcome: { committed: true }, contractId: WALLET_B, keyId: KEY_B });

  await page.evaluate((k) => (window as unknown as { __passkey: { release: (n: string) => void } }).__passkey.release(k), `restore:${KEY_A}`);
  await expect(page.locator('form [role="alert"]')).toHaveText(ACTION_SUPERSEDED_COPY, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Send KALE' })).toBeEnabled();
  await page.waitForTimeout(300);

  const after = await passkey(page);
  expect(after.built, 'no transfer built (for A or B)').toEqual([]);
  expect(after.signed, 'no passkey prompt').toEqual([]);
  expect(relayed, 'nothing relayed').toEqual([]);
  expect(after.log, "the aborted transfer never restored B's wallet on A's behalf").toEqual([
    `restore:${KEY_A}`,
    `interactive:${KEY_B}`,
  ]);
  await expect(page.getByText(/^Sent .* KALE to/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('transfer under A held at Turnstile → B logs in → Turnstile releases: ZERO relay POST, "nothing was sent"', async ({
  page,
  context,
}) => {
  const relayed = await trackRelayer(page);
  await installHeldTurnstile(page);
  await openAccount(page, context);
  await installPasskeyBoundary(page, { interactive: [KEY_B] });
  await submitTransfer(page);
  // Built AND signed for A; now held at the Turnstile challenge.
  await expect.poll(() => turnstileRendered(page), { timeout: 15_000 }).toBe(1);
  expect(await passkey(page)).toMatchObject({ built: [COLLECTOR], signed: [COLLECTOR] });

  expect(await loginBNow(page)).toEqual({ outcome: { committed: true }, contractId: WALLET_B, keyId: KEY_B });
  await page.evaluate(() => (window as unknown as { __turnstile: { release: () => void } }).__turnstile.release());
  await expect(page.locator('form [role="alert"]')).toHaveText(ACTION_SUPERSEDED_UNSENT_COPY, { timeout: 10_000 });
  await page.waitForTimeout(500);
  expect(relayed, 'ZERO relay POST for A after B took over').toEqual([]);
  await expect(page.getByText(/^Sent .* KALE to/)).toHaveCount(0);
});

test('batch mint: session change during onBeforeSubmit → ZERO POST /mint, "nothing was sent"', async ({ page, context }) => {
  const TRACK = { id: 'ab'.repeat(32), creator: CREATOR };
  await signInAs(context, COLLECTOR, KEY_A);
  const mints: string[] = [];
  await page.route(`${API_URL}/mint`, async (route) => {
    mints.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4328', 'Access-Control-Allow-Credentials': 'true' },
      body: JSON.stringify({ acceptedIds: [TRACK.id] }),
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Open account menu/i })).toBeVisible({ timeout: 15_000 });

  const result = await page.evaluate(
    async ({ track, B, KEY_B }) => {
      (window as unknown as { __smolCollectSeams: unknown }).__smolCollectSeams = {
        mint: {
          assemble: async () => ({ built: { toXDR: () => 'e2e-batch-mint' } }),
          expiration: async () => 66_000_000,
          sign: async () => {},
        },
      };
      const user = await import(/* @vite-ignore */ String('/src/stores/user.svelte.ts'));
      const { submitMintBatch } = await import(/* @vite-ignore */ String('/src/hooks/useMixtapeMinting.ts'));
      try {
        await submitMintBatch({
          tracks: [track],
          session: user.captureSessionTicket()!,
          // The session changes DURING the pre-dispatch guard.
          onBeforeSubmit: () => user.setUserAuth(B, KEY_B),
        });
        return { name: 'sent' };
      } catch (e) {
        return { error: (e as Error).message, name: (e as Error).name };
      }
    },
    { track: TRACK, B: WALLET_B, KEY_B }
  );
  expect(result).toMatchObject({ name: 'WalletActionSupersededError', error: ACTION_SUPERSEDED_UNSENT_COPY });
  await page.waitForTimeout(300);
  expect(mints, 'ZERO mint POST').toEqual([]);
});
