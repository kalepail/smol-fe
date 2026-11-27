import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { StrKey, hash } from '@stellar/stellar-sdk';
import { COLLECTOR, mixedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario, type ChainStats } from './helpers/stellarMock';

// KALE balance in the TopBar account pill: auto-loaded once signed in (no
// clicks), never rendered as 0 on an RPC error, and zero RPC while signed out.
// RPC is mocked with real XDR; nothing is signed or submitted.
const KALE = (n: number) => BigInt(n) * 10_000_000n;
const WALLET_B = StrKey.encodeContract(hash(Buffer.from('smol-e2e-collector-b')));
const mixedIds = mixedTracks.map((track) => track.Id);
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

const rpcCalls = (s: ChainStats) =>
  s.getLedgerEntries + s.getVersionInfo + s.getLatestLedger + s.getHealth + s.simulateTransaction;

const pill = (page: Page) => page.getByRole('button', { name: /Open account menu/i });

async function assertHeaderFits(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
  const box = await pill(page).boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box, 'account pill is rendered').not.toBeNull();
  expect(box!.height, 'pill tap target').toBeGreaterThanOrEqual(44);
  expect(box!.width, 'pill tap target').toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width, 'pill stays inside the viewport').toBeLessThanOrEqual(vw);
}

const VIEWPORTS = [
  { tag: '375', use: { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }, address: false },
  { tag: '1440', use: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }, address: true },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`header KALE balance @${vp.tag}`, () => {
    test.use(vp.use);

    test('signed-in Home auto-loads the pill balance with zero clicks, one 1-key read', async ({ page, context }) => {
      await signIn(context);
      const stats = await installStellarMock(page, () => ({ minted: [], balances: {}, kale: KALE(1_250) }));
      await page.goto('/');
      const balance = pill(page).locator('[data-header-balance]');
      await expect(balance).toHaveText('1.25K KALE', { timeout: 15_000 });
      await expect(pill(page)).toHaveAttribute('title', '1,250 KALE');
      await expect(pill(page)).toHaveAccessibleName('Open account menu, 1,250 KALE');
      const address = pill(page).getByText(/^C[A-Z0-9]{5}…[A-Z0-9]{4}$/);
      if (vp.address) await expect(address).toBeVisible();
      else await expect(address).toBeHidden();
      await assertHeaderFits(page);
      expect(stats.getLedgerEntries, 'one read for the header balance').toBe(1);
      expect(stats.keys).toEqual([1]);
    });
  });
}

test.describe('header KALE balance', () => {
  test('signed-out Home makes zero RPC calls and shows Sign in', async ({ page }) => {
    const stats = await installStellarMock(page, () => ({ minted: [], balances: {}, kale: KALE(1_000) }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play First Track' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
    await expect(pill(page)).toHaveCount(0);
    await page.waitForTimeout(600); // well past the 120ms auto-load defer
    expect(rpcCalls(stats), 'no chain reads while signed out').toBe(0);
  });

  test('AccountSheet shows the balance immediately with Refresh, never "Check balance"', async ({ page, context }) => {
    await signIn(context);
    let scenario: ChainScenario = { minted: [], balances: {}, kale: KALE(1_250) };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/');
    await expect(pill(page).locator('[data-header-balance]')).toHaveText('1.25K KALE', { timeout: 15_000 });

    await pill(page).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await expect(sheet.locator('[data-sheet-balance]')).toHaveText('1,250 KALE');
    await expect(sheet.getByRole('button', { name: 'Check balance' })).toHaveCount(0);
    const refresh = sheet.getByRole('button', { name: 'Refresh KALE balance' });
    await expect(refresh).toBeEnabled();
    expect(stats.getLedgerEntries, 'opening the sheet reuses the fresh header read').toBe(1);

    // Forced refresh keeps the current value visible, then shows the new one.
    scenario = { ...scenario, kale: KALE(2_000) + 5_000_000n, delayMs: 800 };
    await refresh.click();
    await expect(sheet.getByRole('button', { name: 'Refreshing KALE balance' })).toBeDisabled();
    await expect(sheet.locator('[data-sheet-balance]')).toHaveText('1,250 KALE');
    await expect(sheet.locator('[data-sheet-balance]')).toHaveText('2,000.5 KALE', { timeout: 10_000 });
    await expect(pill(page)).toHaveAttribute('title', '2,000.5 KALE');
    await expect(sheet.getByRole('button', { name: 'Refresh KALE balance' })).toBeEnabled();
    expect(stats.getLedgerEntries).toBe(2);
  });

  test('RPC error never renders 0 KALE in the pill; AccountSheet offers Retry', async ({ page, context }) => {
    await signIn(context);
    let scenario: ChainScenario = { minted: [], balances: {}, kale: 0n, fail: true };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/');
    await expect(pill(page)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => stats.getLedgerEntries, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    await expect(pill(page).locator('[data-header-balance-loading]')).toHaveCount(0, { timeout: 10_000 });
    await expect(pill(page).locator('[data-header-balance]')).toHaveCount(0);
    await expect(pill(page)).not.toContainText('KALE');
    await expect(pill(page)).toHaveAccessibleName('Open account menu');
    expect(await pill(page).getAttribute('title')).toBeNull();

    await pill(page).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByText('Unavailable', { exact: true })).toBeVisible({ timeout: 10_000 });
    const retry = sheet.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Check balance' })).toHaveCount(0);
    await expect(sheet).not.toContainText('0 KALE');

    scenario = { minted: [], balances: {}, kale: KALE(450) };
    await retry.click();
    await expect(sheet.locator('[data-sheet-balance]')).toHaveText('450 KALE', { timeout: 10_000 });
    await expect(pill(page).locator('[data-header-balance]')).toHaveText('450 KALE');
  });
});

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

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

const snapshotCors = {
  'access-control-allow-origin': 'http://127.0.0.1:4328',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'Content-Type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Never shows the departed collector's 100 KALE (Home's read failed: no amount at all). */
async function expectNoBalance(page: Page) {
  await expect(pill(page).locator('[data-header-balance]')).toHaveCount(0);
}

test.describe('Mixtape snapshot sharing and navigation', () => {
  test('the header shares one ledger snapshot with the mixtape while likes are loading', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    let likesHeld = 0;
    await page.route(/^http:\/\/127\.0\.0\.1:4329\/likes(\?|$)/, async (route) => {
      likesHeld++;
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 15_000 });
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE');
    await page.waitForTimeout(800);
    expect(likesHeld, '/likes was slow').toBeGreaterThan(0);
    expect(stats.keys, 'header rode the collector snapshot: [49], never [1, 49]').toEqual([49]);
    expect(stats.getLedgerEntries).toBe(1);
  });

  test('the header loads its own balance if the mixtape cannot hydrate', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, collectorScenario);
    await page.route(/\/src\/components\/mixtape\/MixtapeDetailView\.svelte/, (route) => route.abort());
    await page.goto('/mixtapes/collect-mixed');
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 10_000 });
    expect(stats.keys).toEqual([1]);
  });

  for (const order of ['collector first', 'Home first'] as const) {
    test(`same-wallet navigation ignores the departed snapshot when the Home read fails (${order})`, async ({ page, context }) => {
      await signIn(context);
      const collectorHeld = gate();
      const homeHeld = gate();
      let scenario: ChainScenario = { ...collectorScenario(), kale: KALE(100), hold: collectorHeld.promise };
      const stats = await installStellarMock(page, () => scenario);
      await page.goto('/mixtapes/collect-mixed');
      await expect.poll(() => stats.getLedgerEntries, { timeout: 15_000 }).toBe(1); // collector's 49-key request, held at 100

      scenario = { ...collectorScenario(), fail: true, hold: homeHeld.promise }; // Home's read will fail
      await softNavigate(page, '/');
      await expect(page).toHaveURL(/\/$/);
      await expect.poll(() => stats.getLedgerEntries, { timeout: 5_000 }).toBe(2); // Home's own read, held

      const [first, second] = order === 'collector first' ? [collectorHeld, homeHeld] : [homeHeld, collectorHeld];
      first.open();
      await page.waitForTimeout(1_000);
      await expectNoBalance(page);
      second.open();
      await page.waitForTimeout(1_200);
      await expectNoBalance(page);
      await expect(pill(page)).toContainText(`${COLLECTOR.slice(0, 6)}…${COLLECTOR.slice(-4)}`);
    });
  }

  test('a snapshot for wallet B falls back to a ledger read for the signed-in wallet A', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    await context.addInitScript(() => {
      (window as unknown as { __smolCollectSeams: unknown }).__smolCollectSeams = { serverSnapshot: true };
    });
    const stats = await installStellarMock(page, () => collectorScenario());
    let posts = 0;
    await page.route('http://127.0.0.1:4329/chain/snapshot', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: snapshotCors });
      posts++;
      await route.fulfill({
        headers: snapshotCors,
        contentType: 'application/json',
        body: JSON.stringify({ holder: WALLET_B, kale: { state: 'known', amount: KALE(200).toString() }, tracks: [] }),
      });
    });
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 15_000 });
    await expect(card(page).getByRole('heading')).not.toHaveText('Checking what you own…');
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 5_000 });
    await expect(pill(page)).toContainText(`${COLLECTOR.slice(0, 6)}…${COLLECTOR.slice(-4)}`);
    expect(posts).toBe(1);
    expect(stats.keys.some((n) => n > 1), 'A\'s direct ledger batch served the collector').toBe(true);
  });
});
