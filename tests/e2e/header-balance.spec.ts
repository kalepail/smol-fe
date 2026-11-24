import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { COLLECTOR } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario, type ChainStats } from './helpers/stellarMock';

// KALE balance in the TopBar account pill: auto-loaded once signed in (no
// clicks), never rendered as 0 on an RPC error, and zero RPC while signed out.
// RPC is mocked with real XDR; nothing is signed or submitted.
const KALE = (n: number) => BigInt(n) * 10_000_000n;

function fakeJwt(sub: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub, key: 'fixture-key-1', exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function signIn(context: BrowserContext) {
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(COLLECTOR), url: 'http://127.0.0.1:4328' }]);
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
  { tag: '390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, address: false },
  { tag: '1280', use: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }, address: true },
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
      const address = pill(page).getByText(/^C[A-Z0-9]{5}\.\.\.[A-Z0-9]{4}$/);
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
