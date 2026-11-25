import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { StrKey, hash } from '@stellar/stellar-sdk';
import { COLLECTOR, mixedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario } from './helpers/stellarMock';

// Report 49 Pass 5 (exact-SHA review of af52730) regressions for the shared
// KALE balance. RPC is mocked with real XDR; nothing is signed or sent.
const KALE = (n: number) => BigInt(n) * 10_000_000n;
const WALLET_B = StrKey.encodeContract(hash(Buffer.from('smol-e2e-collector-b')));
const mixedIds = mixedTracks.map((t) => t.Id);
const OWNED = 10_000_000n * 10_000_000n;
const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

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
async function expectNo100(page: Page) {
  await expect(pill(page)).not.toHaveAttribute('title', '100 KALE');
  await expect(pill(page).locator('[data-header-balance]')).toHaveCount(0);
}

test.describe('Report 49 Pass 5 header balance', () => {
  for (const order of ['collector first', 'Home first'] as const) {
    test(`P2 departed collector's 100 never lands on Home when Home's read fails (${order})`, async ({ page, context }) => {
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
      await expectNo100(page);
      second.open();
      await page.waitForTimeout(1_200);
      await expectNo100(page);
      await expect(pill(page)).toContainText(short(COLLECTOR));
    });
  }

  test('P2 a server snapshot naming B while A is still signed in falls back to A\'s ledger batch', async ({ page, context }) => {
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
    await expect(pill(page)).toContainText(short(COLLECTOR));
    expect(posts).toBe(1);
    expect(stats.keys.some((n) => n > 1), 'A\'s direct ledger batch served the collector').toBe(true);
  });
});
