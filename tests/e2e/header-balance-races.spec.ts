import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { StrKey, hash } from '@stellar/stellar-sdk';
import { COLLECTOR, crosswiredSong, derive, mintedTracks, mixedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario } from './helpers/stellarMock';

// Report 49 regressions for the shared KALE balance (header pill, account
// sheet, /account). RPC is mocked with real XDR; nothing is signed or sent.
const KALE = (n: number) => BigInt(n) * 10_000_000n;
const WALLET_B = StrKey.encodeContract(hash(Buffer.from('smol-e2e-collector-b')));
const mixedIds = mixedTracks.map((t) => t.Id);
const mintedIds = mintedTracks.map((t) => t.Id);
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

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

const pill = (page: Page) => page.getByRole('button', { name: /Open account menu/i });
const card = (page: Page) => page.locator('section[aria-labelledby="collect-title"]');

/** Client-side (ClientRouter) navigation: the balance store survives it. */
async function softNavigate(page: Page, href: string) {
  await page.evaluate((target) => {
    const a = document.createElement('a');
    a.href = target;
    a.textContent = 'go';
    document.body.appendChild(a);
    a.click();
  }, href);
}

test.describe('Report 49 header balance races', () => {
  test('P1-1 a held trade snapshot for wallet A never lands in wallet B\'s pill', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    const base: ChainScenario = {
      minted: [crosswiredSong.Id, mixedIds[0]],
      balances: {},
      kale: 0n,
      kaleByHolder: { [COLLECTOR]: KALE(100), [WALLET_B]: KALE(200) },
    };
    let scenario: ChainScenario = base;
    const stats = await installStellarMock(page, () => scenario);
    await page.goto(`/${crosswiredSong.Id}`);
    await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 15_000 });
    await page.waitForTimeout(800);

    // A's trade snapshot is held in flight.
    const held = gate();
    scenario = { ...base, hold: held.promise };
    const before = stats.getLedgerEntries;
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    await expect.poll(() => stats.getLedgerEntries, { timeout: 10_000 }).toBe(before + 1);
    scenario = base;

    // The session switches to B (another tab signed in as B); returning to this tab reconciles.
    await signIn(context, WALLET_B);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(pill(page)).toHaveAttribute('title', '200 KALE', { timeout: 10_000 });

    // A's response (100 KALE) finally arrives: it must not relabel B's pill.
    held.open();
    await page.waitForTimeout(1_200);
    await expect(pill(page)).toHaveAttribute('title', '200 KALE');
    await expect(pill(page)).toHaveAccessibleName('Open account menu, 200 KALE');
  });

  test('P1-2 slow GET /likes still produces ONE 49-key read on /mixtapes/collect-mixed', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, () => ({
      minted: mixedIds.slice(0, 9),
      balances: Object.fromEntries(mixedIds.slice(0, 4).map((id) => [id, OWNED])),
      kale: KALE(1_000),
    }));
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

  test('P1-2 a failed 49-key snapshot is published: no redundant 1-key retry ([49] only)', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, () => ({ minted: [], balances: {}, kale: 0n, fail: true }));
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('heading')).toHaveText("Couldn't check what you own", { timeout: 15_000 });
    await page.waitForTimeout(1_200); // well past the header's 120 ms defer
    expect(stats.getLedgerEntries, 'the failed snapshot is the only ledger read').toBe(1);
    await expect(pill(page).locator('[data-header-balance-loading]')).toHaveCount(0);
    await expect(pill(page).locator('[data-header-balance]')).toHaveCount(0);
    await expect(pill(page)).not.toContainText('KALE');
  });

  for (const variant of ['ledger', 'server'] as const) {
    test(`P2-3 Refresh during an older pending ${variant} snapshot shows 300 and is never overwritten back to 100`, async ({ page, context }) => {
      await signIn(context);
      const base: ChainScenario = {
        minted: mintedIds,
        balances: Object.fromEntries(mintedIds.map((id) => [id, OWNED])),
        kale: KALE(100),
      };
      let scenario: ChainScenario = base;
      const stats = await installStellarMock(page, () => scenario);
      const snapshotHeld = gate();
      let snapshotCalls = 0;
      if (variant === 'server') {
        await context.addInitScript(() => {
          (window as unknown as { __smolCollectSeams: unknown }).__smolCollectSeams = { serverSnapshot: true };
        });
        await page.route('http://127.0.0.1:4329/chain/snapshot', async (route) => {
          const headers = {
            'access-control-allow-origin': 'http://127.0.0.1:4328',
            'access-control-allow-credentials': 'true',
            'access-control-allow-headers': 'Content-Type',
            'access-control-allow-methods': 'POST, OPTIONS',
          };
          if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
          snapshotCalls++;
          await snapshotHeld.promise; // an older server snapshot: 100 KALE
          await route.fulfill({
            headers,
            contentType: 'application/json',
            body: JSON.stringify({
              kale: { state: 'known', amount: KALE(100).toString() },
              tracks: mintedTracks.map((t) => ({
                id: t.Id,
                sac: derive(t.Id).sac,
                pool: derive(t.Id).pool,
                mint: 'verified',
                balance: { state: 'known', amount: OWNED.toString() },
              })),
            }),
          });
        });
      }

      await page.goto('/');
      await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 15_000 });
      expect(stats.getLedgerEntries).toBe(1);

      if (variant === 'ledger') scenario = { ...base, hold: snapshotHeld.promise };
      await softNavigate(page, '/mixtapes/collect-minted');
      // Every collector read started now is held, carrying the older 100 KALE.
      // (A soft navigation may start more than one; all are older than Refresh.)
      if (variant === 'ledger') {
        await expect.poll(() => stats.getLedgerEntries, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
      } else {
        await expect.poll(() => snapshotCalls, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
      }
      await expect(page).toHaveURL(/\/mixtapes\/collect-minted$/);
      await page.waitForTimeout(600);
      // The balance changes on chain while that older read is still pending.
      scenario = { ...base, kale: KALE(300) };

      await pill(page).click();
      const sheet = page.locator('dialog[open]');
      await expect(sheet.locator('[data-sheet-balance]')).toHaveText('100 KALE');
      await sheet.getByRole('button', { name: 'Refresh KALE balance' }).click();
      await expect(sheet.locator('[data-sheet-balance]')).toHaveText('300 KALE', { timeout: 10_000 });
      await expect(pill(page)).toHaveAttribute('title', '300 KALE');

      // The older snapshot resolves with 100: it must never restore it.
      snapshotHeld.open();
      await expect(card(page).getByRole('heading')).toHaveText('You own this mixtape', { timeout: 15_000 });
      await page.waitForTimeout(800);
      await expect(sheet.locator('[data-sheet-balance]')).toHaveText('300 KALE');
      await expect(pill(page)).toHaveAttribute('title', '300 KALE');
    });
  }

  test('P2-4 another tab\'s sign-out clears this tab\'s pill without navigation', async ({ page, context }) => {
    await signIn(context);
    await installStellarMock(page, () => ({ minted: [], balances: {}, kale: KALE(1_000) }));
    await page.goto('/');
    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 15_000 });

    const other = await context.newPage();
    await installStellarMock(other, () => ({ minted: [], balances: {}, kale: KALE(1_000) }));
    await other.goto('/');
    await expect(pill(other)).toBeVisible({ timeout: 15_000 });
    await pill(other).click();
    await other.locator('dialog[open]').getByRole('button', { name: 'Sign out' }).click();
    await expect(other.getByRole('button', { name: 'Sign in' }).first()).toBeVisible({ timeout: 10_000 });

    // Back in the first tab (no navigation): the pill is gone.
    await expect(pill(page)).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
    await other.close();
  });

  test('P2-4 a pending auto-load timer after the cookie is cleared sends ZERO RPCs and clears the pill', async ({ page, context }) => {
    await signIn(context);
    await context.addInitScript(() => {
      (window as unknown as { __smolCollectSeams: unknown }).__smolCollectSeams = { balanceDeferMs: 2_000 };
    });
    const stats = await installStellarMock(page, () => ({ minted: [], balances: {}, kale: KALE(1_000) }));
    await page.goto('/');
    await expect(pill(page).locator('[data-header-balance-loading]')).toBeVisible({ timeout: 15_000 });
    expect(stats.getLedgerEntries).toBe(0);

    await context.clearCookies(); // e.g. signed out in another tab
    await page.waitForTimeout(2_800); // the pending timer fires
    expect(stats.getLedgerEntries, 'no read for a signed-out session').toBe(0);
    await expect(pill(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('P2-5 a failed Refresh shows visible error copy and a Retry button in the AccountSheet', async ({ page, context }) => {
    await signIn(context);
    let scenario: ChainScenario = { minted: [], balances: {}, kale: KALE(1_250) };
    await installStellarMock(page, () => scenario);
    await page.goto('/');
    await expect(pill(page)).toHaveAttribute('title', '1,250 KALE', { timeout: 15_000 });
    await pill(page).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.locator('[data-sheet-balance]')).toHaveText('1,250 KALE');

    scenario = { ...scenario, fail: true };
    await sheet.getByRole('button', { name: 'Refresh KALE balance' }).click();
    await expect(sheet.locator('[data-sheet-balance-error]')).toHaveText(
      "Couldn't refresh. Showing the last known balance.",
      { timeout: 10_000 }
    );
    await expect(sheet.locator('[data-sheet-balance]')).toHaveText('1,250 KALE');
    const retry = sheet.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Refresh KALE balance' })).toHaveCount(0);

    scenario = { minted: [], balances: {}, kale: KALE(1_300) };
    await retry.click();
    await expect(sheet.locator('[data-sheet-balance]')).toHaveText('1,300 KALE', { timeout: 10_000 });
    await expect(sheet.locator('[data-sheet-balance-error]')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Refresh KALE balance' })).toBeVisible();
  });

  test('P2-5 a failed Refresh shows visible error copy and a Retry button on /account', async ({ page, context }) => {
    await signIn(context);
    let scenario: ChainScenario = { minted: [], balances: {}, kale: KALE(1_250) };
    await installStellarMock(page, () => scenario);
    await page.goto('/account');
    const balance = page.locator('[data-account-balance]');
    await expect(balance).toHaveText('1,250 KALE', { timeout: 15_000 });
    const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
    await expect(refresh).toBeEnabled();

    scenario = { ...scenario, fail: true };
    await refresh.click();
    await expect(page.locator('[data-account-balance-error]')).toHaveText(
      "Couldn't refresh. Showing the last known balance.",
      { timeout: 10_000 }
    );
    await expect(balance).toHaveText('1,250 KALE');
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);

    scenario = { minted: [], balances: {}, kale: KALE(1_300) };
    await retry.click();
    await expect(balance).toHaveText('1,300 KALE', { timeout: 10_000 });
    await expect(page.locator('[data-account-balance-error]')).toHaveCount(0);
  });
});
