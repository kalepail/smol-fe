import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {
  COLLECTOR,
  addresslessTrack,
  badExecTrack,
  crosswiredSong,
  derive,
  goodTrack,
  legacyTrack,
  mintedTracks,
  mixedTracks,
  unindexedSong,
} from '../fixtures/collect.mjs';
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
      // First test against a cold dev server: allow route compilation.
      await expect(card(page).getByRole('heading')).toHaveText('12 songs · 9 minted', { timeout: 15_000 });
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
      expect(stats.getLedgerEntries, '12 tracks × (SAC, pool instance, pool records, balance) + KALE = 49 keys in ONE call').toBe(1);
      expect(stats.keys[0]).toBe(49);
      expect(stats.getVersionInfo, 'archive capability checked once').toBe(1);
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
      await expect(page.getByText("Couldn't check", { exact: true }).filter({ visible: true })).toHaveCount(12);
      // #4: a failed read never falls back to D1 "Not minted · 100 KALE".
      await expect(page.getByText('Not minted', { exact: true }).filter({ visible: true })).toHaveCount(0);
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

// ---------------------------------------------------------------------------
// Report 34 regressions (#1–#12). Nothing is ever signed or submitted.
// ---------------------------------------------------------------------------

const mintedSteps = (status: string, extra: Record<string, unknown> = {}) => [
  {
    id: 'buy-1',
    kind: 'buy',
    trackIds: mintedIds,
    titles: mintedTracks.map((t) => t.Title),
    costStroops: KALE(264).toString(),
    status,
    since: Date.now(),
    ...extra,
  },
];

async function seedFlow(context: BrowserContext, mixtapeId: string, steps: unknown[]) {
  await context.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [`smol:collect:v1:${COLLECTOR}:${mixtapeId}`, JSON.stringify({ v: 1, updatedAt: Date.now(), steps })] as const
  );
}

test.describe('Report 34 regressions @390', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('#1 an uncertain buy stays locked through reload + Start over (no double buy)', async ({ page, context }) => {
    await signIn(context);
    await seedFlow(context, 'collect-minted', mintedSteps('failed', { failure: 'uncertain', expiresAtLedger: 99_999_999 }));
    await installStellarMock(page, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await expect(card(page).getByRole('heading')).toHaveText('Collecting paused', { timeout: 10_000 });
    await expect(card(page)).not.toContainText('Nothing else was charged');
    await expect(card(page)).toContainText("We're still confirming 1");
    await card(page).getByRole('button', { name: 'Start over' }).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('button', { name: /Collect for|Buy all 8/ })).toHaveCount(0);
    await page.reload();
    await expect(card(page).getByRole('heading')).toHaveText('Collecting paused', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Buy all 8/ })).toHaveCount(0);
  });

  test('#2 expired without a receipt: honest copy + explicit Acknowledge & start new purchase', async ({ page, context }) => {
    await signIn(context);
    await seedFlow(context, 'collect-minted', mintedSteps('failed', { failure: 'uncertain', expiresAtLedger: 100 }));
    await installStellarMock(page, () => ({ minted: mintedIds, balances: ownedBalances(mintedIds.slice(0, 7)), kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await expect(card(page).getByText('Previous request timed out or expired. Check your holdings before starting a new purchase.')).toBeVisible({ timeout: 10_000 });
    await expect(card(page)).not.toContainText('Nothing else was charged');
    await expect(page.getByRole('button', { name: /^(Continue|Buy|Complete)/ })).toHaveCount(0);
    await card(page).getByRole('button', { name: 'Acknowledge & start new purchase' }).click();
    // Explicit, fresh new purchase: only the eighth (still unheld) song, from a fresh read.
    await expect(page.locator('dialog[open]').getByRole('button', { name: 'Collect for 33 KALE' })).toBeEnabled({ timeout: 10_000 });
  });

  test('#2 a legacy V1 uncertain record (no since/expiry) is recoverable, never auto-claimed', async ({ page, context }) => {
    await signIn(context);
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [
        `smol:collect:v1:${COLLECTOR}:collect-minted`,
        JSON.stringify({
          v: 1,
          updatedAt: Date.now() - 24 * 60 * 60_000,
          steps: [{ id: 'buy-1', kind: 'buy', trackIds: mintedIds, titles: [], costStroops: KALE(264).toString(), status: 'failed', failure: 'uncertain' }],
        }),
      ] as const
    );
    await installStellarMock(page, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await expect(card(page).getByRole('button', { name: 'Acknowledge & start new purchase' })).toBeVisible({ timeout: 10_000 });
    await expect(card(page)).not.toContainText('Nothing else was charged');
  });

  test('#1 multi-tab: tab B cannot sign while tab A holds an uncertain/submitted lock', async ({ context }) => {
    await signIn(context);
    const scenario = () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await installStellarMock(tabA, scenario);
    const statsB = await installStellarMock(tabB, scenario);
    await tabA.goto('/mixtapes/collect-minted');
    await tabB.goto('/mixtapes/collect-minted');
    await card(tabB).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
    const sheetB = tabB.locator('dialog[open]');
    await expect(sheetB.getByRole('button', { name: 'Collect for 264 KALE' })).toBeEnabled();

    // Tab A is mid-collect: it holds the cross-tab lock (passkey prompt open).
    const lockName = `smol-collect:${COLLECTOR}:collect-minted`;
    // Wait until A has actually been GRANTED the lock before B clicks.
    await tabA.evaluate(
      (name) =>
        new Promise<void>((granted) => {
          (window as unknown as { __release: () => void }).__release = () => {};
          void navigator.locks.request(name, () => {
            granted();
            return new Promise<void>((resolve) => {
              (window as unknown as { __release: () => void }).__release = resolve;
            });
          });
        }),
      lockName
    );

    // Tab B clicks Collect: it must wait for A's lock, not sign.
    await sheetB.getByRole('button', { name: 'Collect for 264 KALE' }).click();
    await tabB.waitForTimeout(500);
    expect(statsB.simulateTransaction, 'B never builds while A holds the lock').toBe(0);

    // A's relay response is lost: it persists an uncertain step for all 8 songs, then releases.
    await tabA.evaluate(
      ([key, value]) => {
        localStorage.setItem(key, value);
        // Like the store: hold the lock briefly after the last write (cross-process propagation).
        setTimeout(() => (window as unknown as { __release: () => void }).__release(), 150);
      },
      [
        `smol:collect:v1:${COLLECTOR}:collect-minted`,
        JSON.stringify({
          v: 1,
          updatedAt: Date.now(),
          steps: [{ id: 'buy-1', kind: 'buy', trackIds: mintedIds, titles: [], costStroops: KALE(264).toString(), status: 'failed', failure: 'uncertain', since: Date.now(), expiresAtLedger: 99_999_999 }],
        }),
      ] as const
    );

    // B re-reads shared progress inside the lock and refuses to sign or overwrite it.
    await expect(sheetB.getByText(/isn't confirmed yet, so nothing new was signed|in progress or unconfirmed/)).toBeVisible({ timeout: 10_000 });
    expect(statsB.simulateTransaction, 'no duplicate buy was assembled in B').toBe(0);
    const stored = await tabB.evaluate((key) => localStorage.getItem(key), `smol:collect:v1:${COLLECTOR}:collect-minted`);
    expect(JSON.parse(stored!).steps[0].failure, "A's lock survives").toBe('uncertain');
    await expect(card(tabB)).not.toContainText('Nothing else was charged');
    await expect(tabB.getByRole('button', { name: 'Buy all 8 · 264 KALE' })).toHaveCount(0);
  });

  test('#2 song page trades the canonical market, never the cross-wired D1 pool', async ({ page }) => {
    const stats = await installStellarMock(page, () => ({
      minted: [crosswiredSong.Id, unindexedSong.Id, mixedIds[0], mixedIds[1]],
      balances: {},
      kale: 0n,
    }));
    await page.goto(`/${crosswiredSong.Id}?trade=1`);
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Trade SMOL' })).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole('button', { name: 'Sign in to trade' })).toBeVisible({ timeout: 10_000 });
    expect(stats.contracts.has(derive(crosswiredSong.Id).pool), 'canonical pool read').toBe(true);
    expect(stats.contracts.has(derive(mixedIds[0]).pool), 'cross-wired D1 pool never read').toBe(false);
  });

  test('#2 ?trade=1 opens Trade for a song minted on chain but not yet indexed', async ({ page }) => {
    await installStellarMock(page, () => ({ minted: [unindexedSong.Id], balances: {}, kale: 0n }));
    await page.goto(`/${unindexedSong.Id}?trade=1`);
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Trade SMOL' })).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole('button', { name: 'Sign in to trade' })).toBeVisible({ timeout: 10_000 });
  });

  test('#2/#3 an underivable id with another song\'s D1 pair is never tradeable', async ({ page }) => {
    const stats = await installStellarMock(page, () => ({ minted: [mixedIds[1]], balances: {}, kale: 0n }));
    await page.goto(`/${legacyTrack.Id}?trade=1`);
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByText("We couldn't verify this song's market, so trading is paused.")).toBeVisible({ timeout: 10_000 });
    expect(stats.contracts.has(derive(mixedIds[1]).pool)).toBe(false);
  });

  test('Pass3 #1 tab B confirming 1 song never runs tab A\'s cancelled 8-song step', async ({ context }) => {
    await signIn(context);
    const scenario = () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await installStellarMock(tabA, scenario);
    const statsB = await installStellarMock(tabB, scenario);
    await tabA.goto('/mixtapes/collect-minted');
    await tabB.goto('/mixtapes/collect-minted');

    // B: deselect 7 of 8 songs → Collect for 33 KALE.
    await card(tabB).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
    const sheetB = tabB.locator('dialog[open]');
    await sheetB.getByRole('button', { name: /Choose songs/ }).click();
    const boxes = sheetB.getByRole('checkbox');
    for (let i = 1; i < 8; i++) await boxes.nth(i).uncheck();
    await expect(sheetB.getByRole('button', { name: 'Collect for 33 KALE' })).toBeEnabled();

    // A: confirmed 264 KALE, then cancelled at the passkey → a cancelled 8-song step is saved.
    await tabA.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [
        `smol:collect:v1:${COLLECTOR}:collect-minted`,
        JSON.stringify({ v: 1, updatedAt: Date.now(), steps: [{ id: 'buy-1', kind: 'buy', trackIds: mintedIds, titles: [], costStroops: KALE(264).toString(), status: 'cancelled', failure: 'cancelled' }] }),
      ] as const
    );

    await sheetB.getByRole('button', { name: 'Collect for 33 KALE' }).click();
    await expect(sheetB.getByText('This purchase changed in another tab. Check the step below and approve it again.')).toBeVisible({ timeout: 10_000 });
    await tabB.waitForTimeout(300);
    expect(statsB.simulateTransaction, 'B executed nothing it did not confirm').toBe(0);
  });

  test('Pass3 #2 without Web Locks: another tab\'s live signing claim blocks this tab (fail closed)', async ({ context }) => {
    await signIn(context);
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true });
    });
    const scenario = () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await installStellarMock(tabA, scenario);
    const statsB = await installStellarMock(tabB, scenario);
    await tabA.goto('/mixtapes/collect-minted');
    await tabB.goto('/mixtapes/collect-minted');
    expect(await tabB.evaluate(() => navigator.locks)).toBeUndefined();

    await card(tabB).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
    const sheetB = tabB.locator('dialog[open]');
    await expect(sheetB.getByRole('button', { name: 'Collect for 264 KALE' })).toBeEnabled();

    // A holds the cross-tab storage lease (it is mid-checkout).
    await tabA.evaluate(
      (leaseKey) => localStorage.setItem(leaseKey, JSON.stringify({ owner: 'tab-A', expiresAt: Date.now() + 60_000 })),
      `smol:collect-lock:v1:${COLLECTOR}:collect-minted`
    );
    await sheetB.getByRole('button', { name: 'Collect for 264 KALE' }).click();
    await expect(sheetB.getByText('Another tab is completing this purchase. Finish it there, then try again.')).toBeVisible({ timeout: 10_000 });
    expect(statsB.simulateTransaction, 'fail closed: nothing built without the lease').toBe(0);

    // A is now waiting at its passkey prompt for the same 8 songs (live signing claim).
    await tabA.evaluate(
      ([flowKey, flow]) => localStorage.setItem(flowKey, flow),
      [
        `smol:collect:v1:${COLLECTOR}:collect-minted`,
        JSON.stringify({ v: 1, updatedAt: Date.now(), steps: [{ id: 'buy-1', kind: 'buy', trackIds: mintedIds, titles: [], costStroops: KALE(264).toString(), status: 'signing', ownerTabId: 'tab-A', leaseExpiresAt: Date.now() + 60_000 }] }),
      ] as const
    );
    // B immediately stops offering those songs…
    await expect(sheetB.getByRole('button', { name: 'Collect for 264 KALE' })).toHaveCount(0, { timeout: 10_000 });
    // …and a reload in B never downgrades A's live signing step to "cancelled".
    await tabB.reload();
    await expect(card(tabB).getByRole('button', { name: /Collecting…/ })).toBeVisible({ timeout: 10_000 });
    await expect(tabB.getByRole('button', { name: /^(Continue|Buy all)/ })).toHaveCount(0);
    expect(statsB.simulateTransaction).toBe(0);
  });

  test('Pass3 #3 a failed progress write (QuotaExceededError) aborts before signing', async ({ page, context }) => {
    await signIn(context);
    await context.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith('smol:collect:')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    const stats = await installStellarMock(page, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await card(page).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
    const sheet = page.locator('dialog[open]');
    await sheet.getByRole('button', { name: 'Collect for 264 KALE' }).click();
    await expect(
      sheet.getByText("Couldn't save your progress in this browser, so nothing was signed. Free up browser storage and try again.").first()
    ).toBeVisible({ timeout: 10_000 });
    expect(stats.simulateTransaction, '0 submissions').toBe(0);
  });

  test('Pass3 #5 ordinary /{id}: Mint on an unindexed on-chain mint opens Trade, mints nothing', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, () => ({ minted: [unindexedSong.Id], balances: {}, kale: KALE(1_000) }));
    await page.goto(`/${unindexedSong.Id}`);
    await page.getByRole('button', { name: 'Mint', exact: true }).click({ timeout: 10_000 });
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Trade SMOL' })).toBeVisible({ timeout: 10_000 });
    expect(stats.getLedgerEntries, 'canonical identity was read before minting').toBeGreaterThan(0);
    expect(stats.simulateTransaction, 'no mint was built').toBe(0);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Trade', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mint', exact: true })).toHaveCount(0);
  });

  test('Pass4 #1 QuotaExceededError on ONLY the post-passkey "submitting" write → 0 relay calls', async ({ page, context }) => {
    await signIn(context);
    await context.addInitScript(() => {
      const w = window as unknown as { __relays: string[][]; __smolCollectSeams: unknown };
      w.__relays = [];
      w.__smolCollectSeams = {
        buy: {
          assemble: async () => ({}),
          expiration: async () => 66_000_000,
          sign: async () => {},
          relay: async (ids: string[]) => {
            w.__relays.push(ids);
          },
        },
      };
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith('smol:collect:') && value.includes('"status":"submitting"')) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await installStellarMock(page, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await card(page).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
    const sheet = page.locator('dialog[open]');
    await sheet.getByRole('button', { name: 'Collect for 264 KALE' }).click();
    await expect(sheet.getByText(/nothing was sent and you weren't charged/).first()).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => (window as unknown as { __relays: string[][] }).__relays.length), '0 relay calls').toBe(0);
  });

  test('Pass4 #2 lease takeover: the stale signer relays nothing and leaves B\'s record intact', async ({ context }) => {
    await signIn(context);
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true });
      const w = window as unknown as { __relays: string[][]; __releasePasskey: () => void; __smolCollectSeams: unknown };
      w.__relays = [];
      w.__smolCollectSeams = {
        buy: {
          assemble: async () => ({}),
          expiration: async () => 66_000_000,
          // A is held at its passkey prompt until the test releases it.
          sign: () => new Promise<void>((resolve) => (w.__releasePasskey = resolve)),
          relay: async (ids: string[]) => {
            w.__relays.push(ids);
          },
        },
      };
    });
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await installStellarMock(tabA, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await installStellarMock(tabB, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await tabA.goto('/mixtapes/collect-minted');
    await card(tabA).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
    await tabA.locator('dialog[open]').getByRole('button', { name: 'Collect for 264 KALE' }).click();
    await expect.poll(() => tabA.evaluate(() => typeof (window as unknown as { __releasePasskey?: unknown }).__releasePasskey)).toBe('function');

    // A's lease expires; B takes over the same step, relays, and loses its response.
    const flowKey = `smol:collect:v1:${COLLECTOR}:collect-minted`;
    await tabB.goto('/mixtapes/collect-minted');
    const recordB = await tabB.evaluate(
      ([flowKey, leaseKey]) => {
        const flow = JSON.parse(localStorage.getItem(flowKey)!);
        flow.updatedAt = Date.now();
        flow.steps = flow.steps.map((s: Record<string, unknown>) => ({
          ...s,
          status: 'failed',
          failure: 'uncertain',
          ownerTabId: 'tab-B',
          attemptId: 'b-1',
          since: Date.now(),
          expiresAtLedger: 99_999_999,
        }));
        localStorage.setItem(leaseKey, JSON.stringify({ owner: 'tab-B', expiresAt: Date.now() + 60_000 }));
        const value = JSON.stringify(flow);
        localStorage.setItem(flowKey, value);
        return value;
      },
      [flowKey, `smol:collect-lock:v1:${COLLECTOR}:collect-minted`] as const
    );

    // A's original passkey completes after the takeover.
    await tabA.evaluate(() => (window as unknown as { __releasePasskey: () => void }).__releasePasskey());
    await expect(tabA.locator('dialog[open]').getByText('Another tab took over this purchase, so this tab sent nothing. Check the step below.')).toBeVisible({ timeout: 10_000 });
    expect(await tabA.evaluate(() => (window as unknown as { __relays: string[][] }).__relays.length), 'A relays nothing').toBe(0);
    await tabA.waitForTimeout(300);
    expect(await tabA.evaluate((key) => localStorage.getItem(key), flowKey), "B's recorded outcome is untouched").toBe(recordB);
  });

  test('Pass4 #3 a malformed server-snapshot amount (" ") never becomes a known 0', async ({ page, context }) => {
    await signIn(context);
    await context.addInitScript(() => {
      (window as unknown as { __smolCollectSeams: unknown }).__smolCollectSeams = { serverSnapshot: true };
    });
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
      await route.fulfill({
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          kale: { state: 'known', amount: '10000000000' },
          tracks: mintedTracks.map((t) => ({
            id: t.Id,
            sac: derive(t.Id).sac,
            pool: derive(t.Id).pool,
            mint: 'verified',
            balance: { state: 'known', amount: ' ' },
          })),
        }),
      });
    });
    // On the ledger the wallet holds 17 stroops of every song.
    await installStellarMock(page, () => ({ minted: mintedIds, balances: Object.fromEntries(mintedIds.map((id) => [id, 17n])), kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await expect(card(page).getByRole('heading')).toHaveText('You own this mixtape', { timeout: 10_000 });
    expect(snapshotCalls).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /Buy all 8|Collect for/ })).toHaveCount(0);
  });

  test('Pass4 #4 a waiting tab recovers when another tab\'s signing claim expires (no reload)', async ({ page, context }) => {
    await signIn(context);
    const base = Date.now();
    await page.clock.install({ time: base });
    await seedFlow(context, 'collect-minted', [
      { id: 'buy-1', kind: 'buy', trackIds: mintedIds, titles: [], costStroops: KALE(264).toString(), status: 'signing', ownerTabId: 'tab-A', attemptId: 'a-1', leaseExpiresAt: base + 20_000 },
    ]);
    await installStellarMock(page, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await card(page).getByRole('button', { name: /Collecting…/ }).click({ timeout: 10_000 });
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('button', { name: 'Waiting for passkey…' })).toBeDisabled();
    await page.clock.fastForward(25_000); // past tab A's leaseExpiresAt
    await expect(sheet.getByRole('button', { name: /^Continue/ })).toBeEnabled({ timeout: 5_000 });
    await expect(sheet.getByRole('button', { name: 'Waiting for passkey…' })).toHaveCount(0);
  });

  for (const scenarioName of ['stale passkey cancel', 'stale preflight HTTP 500'] as const) {
    test(`Pass5 ${scenarioName} after B's takeover never touches B's uncertain record`, async ({ context }) => {
      await signIn(context);
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true });
        const w = window as unknown as {
          __relays: string[][];
          __cancelPasskey: () => void;
          __smolCollectSeams: unknown;
        };
        w.__relays = [];
        w.__smolCollectSeams = {
          buy: {
            assemble: async () => ({}),
            expiration: async () => 66_000_000,
            sign: () =>
              new Promise<void>((_resolve, reject) => {
                w.__cancelPasskey = () =>
                  reject(Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }));
              }),
            relay: async (ids: string[]) => {
              w.__relays.push(ids);
            },
          },
        };
      });
      const flowKey = `smol:collect:v1:${COLLECTOR}:collect-minted`;
      const leaseKey = `smol:collect-lock:v1:${COLLECTOR}:collect-minted`;
      let scenarioA: ChainScenario = { minted: mintedIds, balances: {}, kale: KALE(1_000) };
      const tabA = await context.newPage();
      const tabB = await context.newPage();
      await installStellarMock(tabA, () => scenarioA);
      await installStellarMock(tabB, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
      await tabA.goto('/mixtapes/collect-minted');
      await card(tabA).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
      if (scenarioName === 'stale preflight HTTP 500') {
        // A's pre-sign ledger read is held, then fails with HTTP 500.
        scenarioA = { ...scenarioA, delayMs: 2_500, fail: true };
      }
      await tabA.locator('dialog[open]').getByRole('button', { name: 'Collect for 264 KALE' }).click();
      // A's signing claim is persisted (A is now at its preflight / passkey prompt).
      await expect.poll(() => tabA.evaluate((k) => localStorage.getItem(k) ?? '', flowKey)).toContain('"status":"signing"');

      // A's lease expires; B takes over, approves the 8-song buy and loses the relay response.
      await tabB.goto('/mixtapes/collect-minted');
      const recordB = await tabB.evaluate(
        ([flowKey, leaseKey]) => {
          const flow = JSON.parse(localStorage.getItem(flowKey)!);
          flow.updatedAt = Date.now();
          flow.steps = flow.steps.map((s: Record<string, unknown>) => ({
            ...s,
            status: 'failed',
            failure: 'uncertain',
            ownerTabId: 'tab-B',
            attemptId: 'b-1',
            leaseExpiresAt: undefined,
            since: Date.now(),
            expiresAtLedger: 99_999_999,
          }));
          localStorage.setItem(leaseKey, JSON.stringify({ owner: 'tab-B', expiresAt: Date.now() + 60_000 }));
          const value = JSON.stringify(flow);
          localStorage.setItem(flowKey, value);
          return value;
        },
        [flowKey, leaseKey] as const
      );

      if (scenarioName === 'stale passkey cancel') {
        await tabA.evaluate(() => (window as unknown as { __cancelPasskey: () => void }).__cancelPasskey());
      }
      // A's stale outcome is ignored; it shows B's record instead of writing.
      await expect(tabA.locator('dialog[open]').getByText(/Another tab took over this purchase/)).toBeVisible({ timeout: 10_000 });
      await tabA.waitForTimeout(400);
      expect(await tabA.evaluate((k) => localStorage.getItem(k), flowKey), "B's uncertain record is byte-identical").toBe(recordB);
      expect(await tabA.evaluate(() => (window as unknown as { __relays: string[][] }).__relays.length), 'A relays nothing').toBe(0);

      // B (reloaded) still sees its unsettled buy and cannot submit a second 264-KALE buy.
      await tabB.reload();
      await expect(card(tabB).getByRole('heading')).toHaveText('Collecting paused', { timeout: 10_000 });
      await expect(tabB.getByRole('button', { name: /^(Continue|Buy all 8|Collect for)/ })).toHaveCount(0);
      expect(await tabB.evaluate((k) => localStorage.getItem(k), flowKey)).toBe(recordB);
      expect(await tabB.evaluate(() => (window as unknown as { __relays: string[][] }).__relays.length)).toBe(0);
    });
  }

  test('#4 an unaudited pool executable can never be traded from the song sheet', async ({ page, context }) => {
    await signIn(context);
    const stats = await installStellarMock(page, () => ({ minted: [badExecTrack.Id], badExec: [badExecTrack.Id], balances: {}, kale: KALE(1_000) }));
    await page.goto(`/${badExecTrack.Id}?trade=1`);
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('button', { name: 'Unsupported pool contract version' })).toBeDisabled({ timeout: 10_000 });
    await expect(sheet.getByRole('button', { name: /^Buy SMOL|^Sell SMOL/ })).toHaveCount(0);
    expect(stats.simulateTransaction).toBe(0);
  });

  test('#5 after verifying an unindexed on-chain mint, the page shows Trade, never Mint', async ({ page }) => {
    await installStellarMock(page, () => ({ minted: [unindexedSong.Id], balances: {}, kale: 0n }));
    await page.goto(`/${unindexedSong.Id}?trade=1`);
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('button', { name: 'Sign in to trade' })).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Trade', exact: true })).toBeVisible();
    await expect(page.getByText('Mint for 100 KALE', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Mint/ })).toHaveCount(0);
  });

  test('#3/#8/#11 legacy id, unaudited pool and addressless rows are unavailable and cost 0', async ({ page, context }) => {
    await signIn(context);
    await installStellarMock(page, () => ({
      minted: [badExecTrack.Id, addresslessTrack.Id, goodTrack.Id, mixedIds[1]],
      badExec: [badExecTrack.Id],
      balances: {},
      kale: KALE(1_000),
    }));
    await page.goto('/mixtapes/collect-legacy');
    await expect(card(page).getByRole('button', { name: 'Buy 1 · 33 KALE' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Not available yet', { exact: true }).filter({ visible: true })).toHaveCount(3);
  });

  test('#5 an archive-blind reader never turns omissions into "unminted" or zero', async ({ page, context }) => {
    await signIn(context);
    await installStellarMock(page, () => ({ minted: mixedIds.slice(0, 9), balances: {}, kale: KALE(1_000), protocolVersion: 22 }));
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('heading')).toHaveText("Couldn't check what you own", { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^(Buy|Complete|Mint|Collect for)/ })).toHaveCount(0);
  });

  for (const variant of ['short', 'malformed'] as const) {
    test(`#6 KALE ${variant}: Continue never builds or simulates a transaction`, async ({ page, context }) => {
      await signIn(context);
      await seedFlow(context, 'collect-minted', [
        { id: 'buy-1', kind: 'buy', trackIds: mintedIds.slice(5), titles: mintedTracks.slice(5).map((t) => t.Title), costStroops: KALE(99).toString(), status: 'cancelled', failure: 'cancelled' },
      ]);
      const stats = await installStellarMock(page, () => ({
        minted: mintedIds,
        balances: ownedBalances(mintedIds.slice(0, 5)),
        kale: variant === 'short' ? KALE(10) : KALE(1_000),
        kaleMalformed: variant === 'malformed',
      }));
      await page.goto('/mixtapes/collect-minted');
      await card(page).getByRole('button', { name: 'Continue · 1 approval left' }).click({ timeout: 10_000 });
      const sheet = page.locator('dialog[open]');
      await expect(
        sheet.getByText(variant === 'short' ? 'Not enough KALE for this step. Add KALE and continue.' : "We couldn't check your KALE balance, so nothing was signed. Try again.")
      ).toBeVisible({ timeout: 10_000 });
      await expect(sheet.getByRole('button', { name: variant === 'short' ? 'Not enough KALE' : 'Check balance again' })).toBeVisible();
      if (variant === 'short') await expect(sheet.getByRole('button', { name: 'Not enough KALE' })).toBeDisabled();
      expect(stats.simulateTransaction, 'no transaction was assembled').toBe(0);
    });
  }

  test('#7 a confirming mint settles from the chain; /mint/status (400 today) is never called', async ({ page, context, request }) => {
    await request.post('http://127.0.0.1:4329/__reset');
    await signIn(context);
    await seedFlow(context, 'collect-mixed', [
      { id: 'mint-1', kind: 'mint', trackIds: mixedIds.slice(9), titles: mixedTracks.slice(9).map((t) => t.Title), costStroops: KALE(300).toString(), status: 'confirming', since: Date.now() },
    ]);
    await installStellarMock(page, () => ({ minted: mixedIds, balances: ownedBalances(mixedIds), kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('heading')).toHaveText('You own this mixtape', { timeout: 15_000 });
    const requests = await (await request.get('http://127.0.0.1:4329/__requests')).json();
    expect(requests['POST /mint/status'] ?? 0).toBe(0);
  });

  test('#9 confirming mint + cancelled buy still offers Continue on the card', async ({ page, context }) => {
    await signIn(context);
    await seedFlow(context, 'collect-mixed', [
      { id: 'mint-1', kind: 'mint', trackIds: mixedIds.slice(9), titles: mixedTracks.slice(9).map((t) => t.Title), costStroops: KALE(300).toString(), status: 'confirming', since: Date.now() },
      { id: 'buy-1', kind: 'buy', trackIds: mixedIds.slice(4, 9), titles: mixedTracks.slice(4, 9).map((t) => t.Title), costStroops: KALE(165).toString(), status: 'cancelled', failure: 'cancelled' },
    ]);
    await installStellarMock(page, () => ({ minted: mixedIds.slice(0, 9), balances: ownedBalances(mixedIds.slice(0, 4)), kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-mixed');
    await expect(card(page).getByRole('button', { name: 'Continue · 1 approval left' })).toBeVisible({ timeout: 10_000 });
    await capture(page, 'S9-confirming-plus-cancelled-390');
  });
});

for (const width of [320, 390] as const) {
  test.describe(`#12 zero layout shift @${width}`, () => {
    test.use({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });

    for (const [target, owned] of [['S3', 4], ['S8', 4], ['S8', 0]] as const) {
      test(`S6 → ${target} (${owned} owned): card height and CTA position hold`, async ({ page, context }) => {
        await signIn(context);
        await installStellarMock(page, () => ({
          minted: mixedIds.slice(0, 9),
          balances: ownedBalances(mixedIds.slice(0, owned)),
          kale: target === 'S8' ? KALE(120) : KALE(1_000),
          delayMs: 1_500,
        }));
        await page.goto('/mixtapes/collect-mixed');
        await expect(card(page)).toHaveAttribute('aria-busy', 'true');
        const cardBefore = await card(page).boundingBox();
        const ctaBefore = await card(page).locator('[data-collect-cta]').boundingBox();
        await expect(card(page)).toHaveAttribute('data-collect-state', target, { timeout: 10_000 });
        const cardAfter = await card(page).boundingBox();
        const ctaAfter = await card(page).locator('[data-collect-cta]').boundingBox();
        expect(Math.abs(cardAfter!.height - cardBefore!.height), 'card height').toBeLessThanOrEqual(1);
        expect(Math.abs(ctaAfter!.y - ctaBefore!.y), 'CTA position').toBeLessThanOrEqual(1);
        await assertNoHorizontalOverflow(page);
        if (width === 320) await capture(page, `${target}-after-S6-${owned}owned-320`);
      });
    }
  });
}
