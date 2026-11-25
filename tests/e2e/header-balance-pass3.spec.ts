import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { StrKey, hash } from '@stellar/stellar-sdk';
import { COLLECTOR, crosswiredSong, mixedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario } from './helpers/stellarMock';

// Report 49 Pass 3 (exact-SHA review of 94d71b3) regressions for the shared
// KALE balance. RPC is mocked with real XDR; outgoing request bodies are
// counted by key (failed requests included). Nothing is signed or sent.
const KALE = (n: number) => BigInt(n) * 10_000_000n;
const WALLET_B = StrKey.encodeContract(hash(Buffer.from('smol-e2e-collector-b')));
const mixedIds = mixedTracks.map((t) => t.Id);
const OWNED = 10_000_000n * 10_000_000n;

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

/** Keys per getLedgerEntries request as SENT (including ones the mock fails). */
function sentKeys(page: Page): number[] {
  const sent: number[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('https://127.0.0.1:4329/') || request.method() !== 'POST') return;
    const body = JSON.parse(request.postData() ?? '{}');
    if (body.method === 'getLedgerEntries') sent.push(body.params?.keys?.length ?? 0);
  });
  return sent;
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

const collectorScenario = (): ChainScenario => ({
  minted: mixedIds.slice(0, 9),
  balances: Object.fromEntries(mixedIds.slice(0, 4).map((id) => [id, OWNED])),
  kale: KALE(1_000),
});

test.describe('Report 49 Pass 3 header balance', () => {
  test('P1 detail island JS delayed 33 s: the header holds (no fallback timer) and the snapshot stays [49]', async ({ page, context }) => {
    test.setTimeout(75_000);
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    let islandDelayed = 0;
    await page.route(/\/src\/components\/mixtape\/MixtapeDetailView\.svelte/, async (route) => {
      islandDelayed++;
      await new Promise((r) => setTimeout(r, 33_000)); // past the old 30 s fallback
      await route.continue();
    });
    await page.goto('/mixtapes/collect-mixed');
    await expect(pill(page).locator('[data-header-balance-loading]')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(31_000);
    expect(stats.getLedgerEntries, 'no 1-key header read while the island is still loading').toBe(0);
    await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 20_000 });
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE');
    await page.waitForTimeout(800);
    expect(islandDelayed).toBeGreaterThan(0);
    expect(stats.keys, 'exactly [49], never [1, 49]').toEqual([49]);
  });

  test('P1 detail island JS failing to load releases the hold: the header reads the key itself ([1])', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    await page.route(/\/src\/components\/mixtape\/MixtapeDetailView\.svelte/, (route) => route.abort());
    await page.goto('/mixtapes/collect-mixed');
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 10_000 });
    expect(stats.keys).toEqual([1]);
  });

  test('P1 header hydrating 3 s after a failed snapshot sends nothing more: [49] only, never [49, 1]', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, () => ({ ...collectorScenario(), fail: true }));
    const sent = sentKeys(page);
    let headerDelayed = 0;
    await page.route(/\/src\/components\/shell\/TopBar\.svelte/, async (route) => {
      headerDelayed++;
      await new Promise((r) => setTimeout(r, 3_000));
      await route.continue();
    });
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('heading')).toHaveText("Couldn't check what you own", { timeout: 15_000 });
    await expect(pill(page)).toBeVisible({ timeout: 10_000 }); // the late header hydrated
    await page.waitForTimeout(1_500); // well past its 120 ms defer
    expect(headerDelayed).toBeGreaterThan(0);
    expect(sent, 'the failed snapshot is the only ledger read').toEqual([49]);
    expect(stats.getLedgerEntries).toBe(1);
    await expect(pill(page).locator('[data-header-balance-loading]')).toHaveCount(0);
    await expect(pill(page)).not.toContainText('KALE');
  });

  test('P1 an older Home error never suppresses the read on a 404 mixtape page after RPC recovery', async ({ page, context }) => {
    await signIn(context);
    let scenario: ChainScenario = { minted: [], balances: {}, kale: KALE(1_000), fail: true };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/');
    await expect.poll(() => stats.getLedgerEntries, { timeout: 10_000 }).toBe(1);
    await expect(pill(page).locator('[data-header-balance-loading]')).toHaveCount(0, { timeout: 5_000 });
    await expect(pill(page)).not.toContainText('KALE');

    scenario = { ...scenario, fail: false }; // RPC recovers
    await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
    await softNavigate(page, '/mixtapes/no-such-mixtape-e2e');
    await expect(page).toHaveURL(/no-such-mixtape-e2e$/, { timeout: 15_000 });
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 10_000 });
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
      'a client-side navigation (the Home error is still in the store)'
    ).toBe(true);
    expect(stats.getLedgerEntries).toBe(2);
    expect(stats.keys).toEqual([1]);
  });

  test('P2 logout while the collector\'s lazy chain-module import is held sends ZERO RPCs', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    const importHeld = gate();
    let importRequests = 0;
    await page.route(/\/src\/utils\/smolChainIdentity\.ts/, async (route) => {
      importRequests++;
      await importHeld.promise;
      await route.continue();
    });
    await page.goto('/mixtapes/collect-mixed');
    await expect.poll(() => importRequests, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(pill(page).locator('[data-header-balance-loading]')).toBeVisible();

    await switchSession(page, context, null); // cookie cleared + focus reconciliation
    await expect(pill(page)).toHaveCount(0, { timeout: 5_000 });

    importHeld.open();
    await page.waitForTimeout(1_500);
    expect(stats.getLedgerEntries, 'no ledger RPC for the former holder').toBe(0);
    await expect(pill(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('P2 wallet A\'s delayed swap completion never closes wallet B\'s trade dialog', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    await context.addInitScript(() => {
      const w = window as unknown as { __smolCollectSeams: unknown; __swapCalls: number; __releaseSwap: () => void };
      const held = new Promise<void>((resolve) => (w.__releaseSwap = resolve));
      w.__swapCalls = 0;
      w.__smolCollectSeams = {
        swap: () => {
          w.__swapCalls++;
          return held;
        },
      };
    });
    await installStellarMock(page, () => ({
      minted: [crosswiredSong.Id],
      balances: {},
      kale: 0n,
      kaleReserve: KALE(1_000),
      kaleByHolder: { [COLLECTOR]: KALE(100), [WALLET_B]: KALE(200) },
    }));
    await page.goto(`/${crosswiredSong.Id}`);
    await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('100 KALE', { timeout: 10_000 });
    await dialog.getByRole('textbox').first().fill('50');
    await dialog.getByRole('button', { name: 'Buy SMOL' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __swapCalls: number }).__swapCalls)).toBe(1);

    // A's swap is pending at the execution boundary; the session switches to B.
    await switchSession(page, context, WALLET_B);
    await expect(pill(page)).toHaveAttribute('title', '200 KALE', { timeout: 10_000 });
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('200 KALE', { timeout: 10_000 });

    // A's swap completes: B's dialog stays open, with no "Bought SMOL" toast.
    await page.evaluate(() => (window as unknown as { __releaseSwap: () => void }).__releaseSwap());
    await page.waitForTimeout(1_500);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('200 KALE');
    await expect(page.getByText('Bought SMOL.')).toHaveCount(0);
    await dialog.getByRole('textbox').first().fill('10');
    await expect(dialog.getByRole('button', { name: 'Buy SMOL' }), 'B can trade (no inherited pending state)').toBeEnabled();
  });

  test('P2 switching A→B on the detail page with A\'s collector read held loads B, then a fresh A on Home', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    const base: ChainScenario = {
      ...collectorScenario(),
      kaleByHolder: { [COLLECTOR]: KALE(100), [WALLET_B]: KALE(200) },
    };
    const held = gate();
    let scenario: ChainScenario = { ...base, hold: held.promise };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/mixtapes/collect-mixed');
    await expect.poll(() => stats.getLedgerEntries, { timeout: 15_000 }).toBe(1); // A's collector read, held
    scenario = base;

    await switchSession(page, context, WALLET_B);
    await expect(pill(page)).toHaveAttribute('title', '200 KALE', { timeout: 10_000 });
    await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 10_000 });

    await softNavigate(page, '/');
    await expect(page).toHaveURL(/\/$/);
    scenario = { ...base, kaleByHolder: { [COLLECTOR]: KALE(300), [WALLET_B]: KALE(200) } };
    await switchSession(page, context, COLLECTOR);
    await expect(pill(page)).toHaveAttribute('title', '300 KALE', { timeout: 10_000 });

    held.open(); // A's departed collector read finally settles
    await page.waitForTimeout(1_200);
    await expect(pill(page)).toHaveAttribute('title', '300 KALE');
  });

  test('P2 navigating Home during a stalled server snapshot loads the Home header at once', async ({ page, context }) => {
    await signIn(context);
    await context.addInitScript(() => {
      (window as unknown as { __smolCollectSeams: unknown }).__smolCollectSeams = { serverSnapshot: true };
    });
    const stats = await installStellarMock(page, collectorScenario);
    const snapshotHeld = gate();
    let snapshotCalls = 0;
    await page.route('http://127.0.0.1:4329/chain/snapshot', async (route) => {
      const headers = {
        'access-control-allow-origin': 'http://127.0.0.1:4328',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'Content-Type',
        'access-control-allow-methods': 'POST, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      snapshotCalls++;
      await snapshotHeld.promise;
      await route.fulfill({ status: 503, headers, body: 'stalled' });
    });
    await page.goto('/mixtapes/collect-mixed');
    await expect.poll(() => snapshotCalls, { timeout: 15_000 }).toBe(1);
    await expect(pill(page).locator('[data-header-balance-loading]')).toBeVisible();
    expect(stats.getLedgerEntries).toBe(0);

    await softNavigate(page, '/');
    await expect(page).toHaveURL(/\/$/);
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 5_000 });
    expect(stats.keys, 'Home read the key itself').toEqual([1]);
    snapshotHeld.open();
  });
});
