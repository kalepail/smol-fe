import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { StrKey, hash } from '@stellar/stellar-sdk';
import { COLLECTOR, crosswiredSong, mixedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario } from './helpers/stellarMock';

// Report 49 Pass 4 (exact-SHA review of 21f7f6b) regressions for the shared
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

/** Another tab changed the session; this tab reconciles when it regains focus. */
async function switchSession(page: Page, context: BrowserContext, wallet: string) {
  await signIn(context, wallet);
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

/** The wallet a credentialed request's session cookie names. */
function cookieWallet(route: Route): string | null {
  const token = /smol_token=([^;]+)/.exec(route.request().headers()['cookie'] ?? '')?.[1];
  if (!token) return null;
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub ?? null;
}

test.describe('Report 49 Pass 4 header balance', () => {
  test('P1 server snapshot after another tab switched A→B: never B\'s balance beside A\'s address', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    await context.addInitScript(() => {
      (window as unknown as { __smolCollectSeams: unknown }).__smolCollectSeams = { serverSnapshot: true };
    });
    let scenario: ChainScenario = { ...collectorScenario(), fail: true };
    await installStellarMock(page, () => scenario);
    let serverUp = false;
    const posts: (string | null)[] = [];
    await page.route('http://127.0.0.1:4329/chain/snapshot', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: snapshotCors });
      const wallet = cookieWallet(route);
      posts.push(wallet);
      if (!serverUp) return route.fulfill({ status: 503, headers: snapshotCors, body: 'down' });
      // The server answers for whichever wallet the cookie names.
      const amount = wallet === WALLET_B ? KALE(200) : KALE(100);
      await route.fulfill({
        headers: snapshotCors,
        contentType: 'application/json',
        body: JSON.stringify({ kale: { state: 'known', amount: amount.toString() }, tracks: [] }),
      });
    });
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('heading')).toHaveText("Couldn't check what you own", { timeout: 15_000 });
    await expect(pill(page)).toContainText(short(COLLECTOR));

    scenario = collectorScenario();
    serverUp = true;
    await signIn(context, WALLET_B); // another tab switched; this tab has not reconciled yet
    await card(page).getByRole('button', { name: 'Try again' }).click();

    await expect(pill(page)).toHaveAttribute('title', '200 KALE', { timeout: 10_000 });
    await expect(pill(page), '200 KALE is labelled with B, never A').toContainText(short(WALLET_B));
    await expect(pill(page)).not.toContainText(short(COLLECTOR));
    expect(posts.slice(1).every((w) => w === WALLET_B), 'every retry POST was B\'s, after reconciling').toBe(true);
  });

  test('P2 Home never adopts a departed collector\'s held 49-key request: shows 300, not 100', async ({ page, context }) => {
    await signIn(context);
    const held = gate();
    const base: ChainScenario = { ...collectorScenario(), kale: KALE(100) };
    let scenario: ChainScenario = { ...base, hold: held.promise };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/mixtapes/collect-mixed');
    await expect.poll(() => stats.getLedgerEntries, { timeout: 15_000 }).toBe(1); // A's 49-key collector request, held at 100

    scenario = { ...base, kale: KALE(300) };
    await softNavigate(page, '/');
    await expect(page).toHaveURL(/\/$/);
    await expect(pill(page)).toHaveAttribute('title', '300 KALE', { timeout: 5_000 });

    held.open();
    await page.waitForTimeout(1_200);
    await expect(pill(page)).toHaveAttribute('title', '300 KALE');
    // keys are recorded when answered: the held 49-key request lands last
    expect(stats.keys, 'Home read the key itself').toEqual([1, 49]);
  });

  test('P2 a late Home failure after navigating to a 404 mixtape never suppresses its recovery', async ({ page, context }) => {
    await signIn(context);
    const held = gate();
    let scenario: ChainScenario = { minted: [], balances: {}, kale: KALE(1_000), fail: true, hold: held.promise };
    const stats = await installStellarMock(page, () => scenario);
    await page.goto('/');
    await expect.poll(() => stats.getLedgerEntries, { timeout: 10_000 }).toBe(1); // Home's failing read, held

    scenario = { minted: [], balances: {}, kale: KALE(1_000) }; // RPC restored
    await softNavigate(page, '/mixtapes/no-such-mixtape-e2e');
    await expect(page).toHaveURL(/no-such-mixtape-e2e$/, { timeout: 15_000 });
    await page.waitForTimeout(500);
    held.open(); // Home's read fails now

    await expect(pill(page)).toHaveAttribute('title', '1,000 KALE', { timeout: 10_000 });
    expect(stats.getLedgerEntries, 'the 404 page read for itself').toBe(2);
  });

  test('P2 a failed detail module never blocks B after A\'s fallback on the same page', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    const stats = await installStellarMock(page, () => ({
      ...collectorScenario(),
      kaleByHolder: { [COLLECTOR]: KALE(100), [WALLET_B]: KALE(200) },
    }));
    await page.route(/\/src\/components\/mixtape\/MixtapeDetailView\.svelte/, (route) => route.abort());
    await page.goto('/mixtapes/collect-mixed');
    await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 10_000 });
    expect(stats.keys).toEqual([1]);

    await switchSession(page, context, WALLET_B);
    await expect(pill(page)).toContainText(short(WALLET_B), { timeout: 5_000 });
    await expect(pill(page)).toHaveAttribute('title', '200 KALE', { timeout: 5_000 });
    expect(stats.keys, 'B read its own key at once').toEqual([1, 1]);
  });

  test('P2 A\'s rejected fallback simulation never writes into B\'s trade dialog', async ({ page, context }) => {
    await signIn(context, COLLECTOR);
    await installStellarMock(page, () => ({
      minted: [crosswiredSong.Id],
      balances: {},
      kale: 0n,
      kaleReserve: KALE(1_000),
      kaleByHolder: { [COLLECTOR]: KALE(100), [WALLET_B]: KALE(200) },
    }));
    const simHeld = gate();
    let simulations = 0;
    await page.route(/^https:\/\/127\.0\.0\.1:4329\//, async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.method !== 'simulateTransaction') return route.fallback();
      simulations++;
      await simHeld.promise;
      await route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'e2e held simulation failure' } }),
      });
    });
    await page.goto(`/${crosswiredSong.Id}`);
    await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('100 KALE', { timeout: 10_000 });
    await dialog.getByRole('textbox').first().fill('5');
    await expect.poll(() => simulations, { timeout: 10_000 }).toBe(1); // A's fallback simulation, held

    await switchSession(page, context, WALLET_B);
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('200 KALE', { timeout: 10_000 });

    simHeld.open(); // A's simulation rejects
    await page.waitForTimeout(1_500);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(dialog.getByText(/Simulation failed|e2e held simulation failure/)).toHaveCount(0);
    await expect(dialog.getByRole('textbox').first()).toHaveValue('');
  });
});
