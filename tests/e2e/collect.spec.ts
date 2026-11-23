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

  test('#1 once the signature has expired unowned, the step is reconciled as not charged', async ({ page, context }) => {
    await signIn(context);
    await seedFlow(context, 'collect-minted', mintedSteps('failed', { failure: 'uncertain', expiresAtLedger: 100 }));
    await installStellarMock(page, () => ({ minted: mintedIds, balances: {}, kale: KALE(1_000) }));
    await page.goto('/mixtapes/collect-minted');
    await expect(card(page).getByRole('button', { name: 'Continue · 1 approval left' })).toBeVisible({ timeout: 10_000 });
    await expect(card(page)).toContainText('Nothing else was charged');
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

    for (const target of ['S3', 'S8'] as const) {
      test(`S6 → ${target}: card height and CTA position hold`, async ({ page, context }) => {
        await signIn(context);
        await installStellarMock(page, () => ({
          minted: mixedIds.slice(0, 9),
          balances: ownedBalances(mixedIds.slice(0, 4)),
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
        if (width === 320) await capture(page, `${target}-after-S6-320`);
      });
    }
  });
}
