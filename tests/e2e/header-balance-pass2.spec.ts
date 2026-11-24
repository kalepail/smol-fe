import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { StrKey, hash } from '@stellar/stellar-sdk';
import { COLLECTOR, crosswiredSong, mintedTracks, mixedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario } from './helpers/stellarMock';

// Report 49 Pass 2 (exact-SHA review of 13373d4) regressions for the shared
// KALE balance. RPC is mocked with real XDR; outgoing request bodies are
// counted by key. Nothing is signed or sent.
const KALE = (n: number) => BigInt(n) * 10_000_000n;
const WALLET_B = StrKey.encodeContract(hash(Buffer.from('smol-e2e-collector-b')));
const mixedIds = mixedTracks.map((t) => t.Id);
const mintedIds = mintedTracks.map((t) => t.Id);
const OWNED = 10_000_000n * 10_000_000n;
const ownedBalances = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, OWNED]));

function fakeJwt(sub: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub, key: 'fixture-key-1', exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function signIn(context: BrowserContext, wallet = COLLECTOR) {
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(wallet), url: 'http://127.0.0.1:4328' }]);
}

/** Another tab changed the session; this tab reconciles when it regains focus. */
async function switchSession(page: Page, context: BrowserContext, wallet: string | null) {
  if (wallet) await signIn(context, wallet);
  else await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

const pill = (page: Page) => page.getByRole('button', { name: /Open account menu/i });
const card = (page: Page) => page.locator('section[aria-labelledby="collect-title"]');

/** Client-side (ClientRouter) navigation: the persisted header survives it. */
async function softNavigate(page: Page, href: string) {
  await page.evaluate((target) => {
    const a = document.createElement('a');
    a.href = target;
    a.textContent = 'go';
    document.body.appendChild(a);
    a.click();
  }, href);
}

async function seedFlow(context: BrowserContext, mixtapeId: string, steps: unknown[]) {
  await context.addInitScript(
    ([key, value]) => {
      if (localStorage.getItem(`__seeded:${key}`)) return;
      localStorage.setItem(`__seeded:${key}`, '1');
      localStorage.setItem(key, value);
    },
    [`smol:collect:v1:${COLLECTOR}:${mixtapeId}`, JSON.stringify({ v: 1, updatedAt: Date.now(), steps })] as const
  );
}

const collectorScenario = (): ChainScenario => ({
  minted: mixedIds.slice(0, 9),
  balances: ownedBalances(mixedIds.slice(0, 4)),
  kale: KALE(1_000),
});

test.describe('Report 49 Pass 2 header balance', () => {
  test('P1 a 17.5 s+ GET /likes still produces exactly [49] (never [1, 49]) and the pill loads without waiting for it', async ({ page, context }) => {
    test.setTimeout(60_000);
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    let likesHeld = 0;
    let likesDone = 0;
    await page.route(/^http:\/\/127\.0\.0\.1:4329\/likes(\?|$)/, async (route) => {
      likesHeld++;
      await new Promise((r) => setTimeout(r, 18_000)); // past the old 15 s claim timeout
      likesDone++;
      await route.continue();
    });
    await page.goto('/mixtapes/collect-mixed');
    // The collector no longer waits for /likes: the header is served while it is still pending.
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 10_000 });
    expect(likesHeld, '/likes is pending').toBeGreaterThan(0);
    expect(likesDone, '/likes has not answered yet').toBe(0);
    await expect.poll(() => likesDone, { timeout: 25_000 }).toBeGreaterThan(0);
    await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 10_000 });
    await page.waitForTimeout(800);
    expect(stats.keys, 'header rode the collector snapshot').toEqual([49]);
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE');
  });

  test('P1 delayed MixtapeDetailView island JS (2.5 s) still produces exactly [49]', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    let islandDelayed = 0;
    await page.route(/\/src\/components\/mixtape\/MixtapeDetailView\.svelte/, async (route) => {
      islandDelayed++;
      await new Promise((r) => setTimeout(r, 2_500));
      await route.continue();
    });
    await page.goto('/mixtapes/collect-mixed');
    // The header hydrated long ago; it must hold for the island (skeleton, zero reads).
    await expect(pill(page).locator('[data-header-balance-loading]')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    expect(stats.getLedgerEntries, 'no 1-key header read before the island hydrates').toBe(0);
    await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 15_000 });
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE');
    await page.waitForTimeout(800);
    expect(islandDelayed, 'the island module was delayed').toBeGreaterThan(0);
    expect(stats.keys, 'exactly [49], never [1, 49]').toEqual([49]);
  });

  test('P1 signing in on a mixtape page, then navigating Home, loads the header (no stuck skeleton)', async ({ page, context }) => {
    const stats = await installStellarMock(page, collectorScenario);
    await page.goto('/mixtapes/collect-mixed');
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible({ timeout: 15_000 });
    expect(stats.getLedgerEntries, 'signed out: zero reads').toBe(0);

    await switchSession(page, context, COLLECTOR);
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 10_000 });
    await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 10_000 });
    await page.waitForTimeout(800);
    expect(stats.keys, 'the sign-in snapshot served the header too').toEqual([49]);

    await softNavigate(page, '/');
    await expect(page).toHaveURL(/\/$/);
    await page.waitForTimeout(800);
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE');
    await expect(pill(page).locator('[data-header-balance-loading]')).toHaveCount(0);
  });

  test('P1 a 404 mixtape page still loads the header balance (one 1-key read, no stuck skeleton)', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    const response = await page.goto('/mixtapes/no-such-mixtape-e2e');
    expect(response?.status()).toBe(404);
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 10_000 });
    await expect(pill(page).locator('[data-header-balance-loading]')).toHaveCount(0);
    await page.waitForTimeout(600);
    expect(stats.keys).toEqual([1]);
  });

  test('P2 logout while the lazy ledger-module import is held sends ZERO RPCs', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, () => ({ minted: [], balances: {}, kale: KALE(1_000) }));
    const importHeld = gate();
    let importRequests = 0;
    await page.route(/\/src\/utils\/batchLedgerEntries\.ts/, async (route) => {
      importRequests++;
      await importHeld.promise;
      await route.continue();
    });
    await page.goto('/');
    // The deferred timer fired and the read is waiting on the lazy transport module.
    await expect.poll(() => importRequests, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(pill(page).locator('[data-header-balance-loading]')).toBeVisible();

    await switchSession(page, context, null); // cookie cleared + focus reconciliation
    await expect(pill(page)).toHaveCount(0, { timeout: 5_000 });

    importHeld.open();
    await page.waitForTimeout(1_500);
    expect(stats.getLedgerEntries, 'no wallet ledger RPC after the import resolved').toBe(0);
    await expect(pill(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('P2 an open MintTradeModal reloads for wallet B (and closes on sign-out) instead of keeping A\'s 100 KALE and limits', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    const scenario: ChainScenario = {
      minted: [crosswiredSong.Id],
      balances: {},
      kale: 0n,
      kaleReserve: KALE(1_000), // buy cap 333.3334 KALE: the user's balance is the limit
      kaleByHolder: { [COLLECTOR]: KALE(100), [WALLET_B]: KALE(200) },
    };
    await installStellarMock(page, () => scenario);
    await page.goto(`/${crosswiredSong.Id}`);
    await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText('Your KALE:')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('100 KALE', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('100 KALE');
    await dialog.getByRole('textbox').first().fill('50');

    await switchSession(page, context, WALLET_B);
    await expect(pill(page)).toHaveAttribute('title', '200 KALE', { timeout: 10_000 });
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('200 KALE', { timeout: 10_000 });
    await expect(dialog.getByText('200 KALE', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('100 KALE', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('textbox').first(), 'A\'s quote input was cleared').toHaveValue('');

    await switchSession(page, context, null);
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5_000 });
    await expect(pill(page)).toHaveCount(0);
  });

  test('P2 A→B→A ignores A\'s pre-switch 100-KALE in-flight request and displays 300 KALE', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    const base: ChainScenario = {
      minted: [],
      balances: {},
      kale: 0n,
      kaleByHolder: { [COLLECTOR]: KALE(100), [WALLET_B]: KALE(200) },
    };
    const held = gate();
    let scenario: ChainScenario = { ...base, hold: held.promise };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/');
    // A's header read (100 KALE at arrival) is held in flight.
    await expect.poll(() => stats.getLedgerEntries, { timeout: 10_000 }).toBe(1);
    scenario = base;

    await switchSession(page, context, WALLET_B);
    await expect(pill(page)).toHaveAttribute('title', '200 KALE', { timeout: 10_000 });

    scenario = { ...base, kaleByHolder: { [COLLECTOR]: KALE(300), [WALLET_B]: KALE(200) } };
    await switchSession(page, context, COLLECTOR);
    await expect(pill(page)).toHaveAttribute('title', '300 KALE', { timeout: 10_000 });
    expect(stats.getLedgerEntries, 'A\'s new session sent its own request').toBe(3);

    held.open(); // A's original 100-KALE response finally arrives
    await page.waitForTimeout(1_200);
    await expect(pill(page)).toHaveAttribute('title', '300 KALE');
    await expect(pill(page)).toHaveAccessibleName('Open account menu, 300 KALE');
  });

  test('P2 a purchase preflight reading 10 KALE updates the header from 1,000 KALE to 10 KALE', async ({ page, context }) => {
    await signIn(context);
    await seedFlow(context, 'collect-minted', [
      { id: 'buy-1', kind: 'buy', trackIds: mintedIds.slice(5), titles: mintedTracks.slice(5).map((t) => t.Title), costStroops: KALE(99).toString(), status: 'cancelled', failure: 'cancelled' },
    ]);
    let scenario: ChainScenario = { minted: mintedIds, balances: ownedBalances(mintedIds.slice(0, 5)), kale: KALE(1_000) };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/mixtapes/collect-minted');
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 15_000 });
    const continueButton = card(page).getByRole('button', { name: 'Continue · 1 approval left' });
    await expect(continueButton).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    scenario = { ...scenario, kale: KALE(10) }; // spent elsewhere meanwhile
    await continueButton.click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByText('Not enough KALE for this step. Add KALE and continue.')).toBeVisible({ timeout: 10_000 });
    await expect(pill(page)).toHaveAttribute('title', '10 KALE', { timeout: 5_000 });
    await expect(pill(page)).toHaveAccessibleName('Open account menu, 10 KALE');
    expect(stats.simulateTransaction, 'nothing was assembled').toBe(0);
  });
});
