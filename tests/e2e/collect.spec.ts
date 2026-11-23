import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { COLLECTOR, mintedTracks, mixedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario } from './helpers/stellarMock';

// Mixtape single-page collector experience (Report 30, S0–S9). RPC is mocked
// with real XDR; nothing is ever signed or submitted.
const RENDERS_DIR = '/home/tyler/code/smol/orchestration/renders/mixtape-single';
const KALE = (n: number) => BigInt(n) * 10_000_000n;
const OWNED = 10_000_000n * 10_000_000n; // 10M tokens (a mint)

const mixedIds = mixedTracks.map((t) => t.Id);
const mintedIds = mintedTracks.map((t) => t.Id);
const ownedBalances = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, OWNED]));

function fakeJwt(sub: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, key: 'fixture-key-1' })).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function signIn(context: BrowserContext) {
  await context.addCookies([{ name: 'smol_token', value: fakeJwt(COLLECTOR), url: 'http://127.0.0.1:4328' }]);
}

async function capture(page: Page, name: string) {
  mkdirSync(RENDERS_DIR, { recursive: true });
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images)
        .filter((img) => img.getBoundingClientRect().top < window.innerHeight)
        .map((img) =>
          img.complete
            ? null
            : new Promise((r) => {
                img.addEventListener('load', r, { once: true });
                img.addEventListener('error', r, { once: true });
                setTimeout(r, 1500);
              })
        )
    );
  });
  await page.screenshot({ path: `${RENDERS_DIR}/${name}.png` });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
  const card = page.locator('section[aria-labelledby="collect-title"]');
  const box = await card.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box, 'collect card is rendered').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(15);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw - 15);
}

const card = (page: Page) => page.locator('section[aria-labelledby="collect-title"]');

const VIEWPORTS = [
  { tag: '390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { tag: '1440', use: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false } },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`collector @${vp.tag}`, () => {
    test.use(vp.use);

    test('S0 signed out: minted counts, sign-in CTA, zero chain reads', async ({ page }) => {
      const stats = await installStellarMock(page, () => ({ minted: [], balances: {}, kale: 0n }));
      await page.goto('/mixtapes/collect-mixed');
      await expect(card(page).getByRole('heading')).toHaveText('12 songs · 9 minted');
      await expect(card(page).getByRole('button', { name: 'Sign in to collect' })).toBeVisible();
      await expect(page.getByText('9/12 minted')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `S0-signed-out-${vp.tag}`);
      expect(stats.getLedgerEntries + stats.getLatestLedger).toBe(0);
    });

    test('S6 → S3 with zero layout shift, one coalesced RPC, no getLatestLedger', async ({ page, context }) => {
      await signIn(context);
      let scenario: ChainScenario = {
        minted: mixedIds.slice(0, 9),
        balances: ownedBalances(mixedIds.slice(0, 4)),
        kale: KALE(1_000),
        delayMs: 2_500,
      };
      const stats = await installStellarMock(page, () => scenario);
      await page.goto('/mixtapes/collect-mixed');
      await expect(card(page)).toHaveAttribute('aria-busy', 'true');
      await expect(card(page).getByRole('heading')).toHaveText('Checking what you own…');
      await expect(card(page).getByRole('button', { name: /Buy|Complete|Collect for/ })).toHaveCount(0);
      const before = await card(page).boundingBox();
      await capture(page, `S6-checking-${vp.tag}`);

      await expect(card(page).getByRole('heading')).toHaveText('You own 4 of 12', { timeout: 10_000 });
      const after = await card(page).boundingBox();
      expect(Math.abs(after!.height - before!.height), 'card height stays fixed S6 → S3').toBeLessThanOrEqual(1);
      await expect(card(page).getByRole('button', { name: 'Mint 3 & buy 5 · 465 KALE' })).toBeEnabled();
      await expect(card(page).getByText('No second purchase')).toBeVisible();
      await expect(page.getByText('4/12 owned')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `S3-mixed-${vp.tag}`);
      expect(stats.getLedgerEntries, '12 tracks + KALE = 37 keys in ONE getLedgerEntries').toBe(1);
      expect(stats.keys[0]).toBe(37);
      expect(stats.getLatestLedger).toBe(0);
      scenario = { ...scenario, delayMs: 0 };

      // Review sheet: exact totals, minting = owning, no "~".
      await card(page).getByRole('button', { name: 'Mint 3 & buy 5 · 465 KALE' }).click();
      const sheet = page.locator('dialog[open]');
      await expect(sheet.getByText('Mint 3 songs')).toBeVisible();
      await expect(sheet.getByText('Buy 5 songs')).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Collect for 465 KALE' })).toBeEnabled();
      await expect(sheet.getByText('Minting makes you the owner right away. No second purchase.')).toBeVisible();
      await expect(sheet).not.toContainText('~');
      await capture(page, `S3-review-sheet-${vp.tag}`);
    });

    test('S7 / C-02: RPC failure is "Couldn\'t check", never 0, never Buy', async ({ page, context }) => {
      await signIn(context);
      await installStellarMock(page, () => ({ minted: [], balances: {}, kale: 0n, fail: true }));
      await page.goto('/mixtapes/collect-mixed');
      await expect(card(page).getByRole('heading')).toHaveText("Couldn't check what you own", { timeout: 10_000 });
      await expect(card(page).getByRole('button', { name: 'Try again' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^(Buy|Complete|Collect for)/ })).toHaveCount(0);
      await expect(page.getByText("Couldn't check", { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `S7-check-failed-${vp.tag}`);
    });

    test('S8: exact shortfall and affordable subset', async ({ page, context }) => {
      await signIn(context);
      await installStellarMock(page, () => ({
        minted: mixedIds.slice(0, 9),
        balances: ownedBalances(mixedIds.slice(0, 4)),
        kale: KALE(120),
      }));
      await page.goto('/mixtapes/collect-mixed');
      await expect(card(page).getByText('You have 120 KALE. This needs 465.')).toBeVisible({ timeout: 10_000 });
      await expect(card(page).getByRole('button', { name: 'Get KALE' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `S8-short-${vp.tag}`);
      await card(page).getByRole('button', { name: 'Buy 3 for 99 KALE instead' }).click();
      const sheet = page.locator('dialog[open]');
      await expect(sheet.getByRole('button', { name: 'Collect for 99 KALE' })).toBeEnabled();
      await capture(page, `S8-affordable-sheet-${vp.tag}`);
    });

    test('S2 owns some, S1 owns none, S5 fully owned', async ({ page, context }) => {
      await signIn(context);
      let balances = ownedBalances(mintedIds.slice(0, 5));
      await installStellarMock(page, () => ({ minted: mintedIds, balances, kale: KALE(1_000) }));
      await page.goto('/mixtapes/collect-minted');
      await expect(card(page).getByRole('heading')).toHaveText('You own 5 of 8', { timeout: 10_000 });
      await expect(card(page).getByRole('button', { name: 'Complete mixtape · 99 KALE' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `S2-partial-${vp.tag}`);

      balances = {};
      await page.reload();
      await expect(card(page).getByRole('heading')).toHaveText("You don't own any of these yet", { timeout: 10_000 });
      await expect(card(page).getByRole('button', { name: 'Buy all 8 · 264 KALE' })).toBeVisible();

      balances = ownedBalances(mintedIds);
      await page.reload();
      await expect(card(page).getByRole('heading')).toHaveText('You own this mixtape', { timeout: 10_000 });
      await expect(page.getByRole('button', { name: /^(Buy|Complete)/ })).toHaveCount(0);
      await expect(page.getByText('8/8 owned')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `S5-owned-${vp.tag}`);
      await card(page).getByRole('button', { name: 'See your songs' }).click();
      await expect(page.locator('dialog[open]').getByRole('link', { name: /Trade/ }).first()).toHaveAttribute('href', /\?trade=1$/);
      await capture(page, `S5-holdings-sheet-${vp.tag}`);
    });

    test('C-15: a song minted on chain but not yet indexed is bought, never re-minted', async ({ page, context }) => {
      await signIn(context);
      await installStellarMock(page, () => ({
        minted: mixedIds.slice(0, 10),
        balances: ownedBalances(mixedIds.slice(0, 4)),
        kale: KALE(1_000),
      }));
      await page.goto('/mixtapes/collect-mixed');
      await expect(card(page).getByRole('button', { name: 'Mint 2 & buy 6 · 398 KALE' })).toBeVisible({ timeout: 10_000 });
    });

    test('S9: saved progress resumes as "Collecting paused"', async ({ page, context }) => {
      await signIn(context);
      const steps = [
        { id: 'mint-1', kind: 'mint', trackIds: mixedIds.slice(9), titles: mixedTracks.slice(9).map((t) => t.Title), costStroops: KALE(300).toString(), status: 'done' },
        { id: 'buy-1', kind: 'buy', trackIds: mixedIds.slice(4, 9), titles: mixedTracks.slice(4, 9).map((t) => t.Title), costStroops: KALE(165).toString(), status: 'cancelled', failure: 'cancelled' },
      ];
      await context.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        [`smol:collect:v1:${COLLECTOR}:collect-mixed`, JSON.stringify({ v: 1, updatedAt: Date.now(), steps })] as const
      );
      await installStellarMock(page, () => ({
        minted: mixedIds,
        balances: ownedBalances([...mixedIds.slice(0, 4), ...mixedIds.slice(9)]),
        kale: KALE(1_000),
      }));
      await page.goto('/mixtapes/collect-mixed');
      await expect(card(page).getByRole('heading')).toHaveText('Collecting paused', { timeout: 10_000 });
      await expect(card(page).getByText('1 of 2 steps done. Nothing else was charged.')).toBeVisible();
      await expect(card(page).getByRole('button', { name: 'Continue · 1 approval left' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `S9-paused-${vp.tag}`);
    });
  });
}
