import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { COLLECTOR, crosswiredSong, mintedTracks } from '../fixtures/collect.mjs';
import { installStellarMock, type ChainScenario } from './helpers/stellarMock';
import { cometDynamicFee, quoteExactIn } from '../../src/utils/cometQuote.ts';
import { minAmountOutFor } from '../../src/utils/slippage.ts';
import { formatAmount } from '../../src/utils/tradeCalculations.ts';

// FE-1 deliverable 5: single-swap 1% `min_amount_out` + batch-buy 2% re-quote
// guard. RPC is mocked with real XDR (pool reserves + SwapFeeConfig); the swap /
// passkey / relay boundaries are E2E seams, so nothing is signed or sent.
const KALE = (n: number) => BigInt(n) * 10_000_000n;
const mintedIds = mintedTracks.map((t) => t.Id);
const TRACK_RESERVE = 9_900_000_000_000_000n;
const TOKENS = (n: number) => BigInt(n) * 10_000_000n;
const FEE_CFG = { minFee: 30_000n, maxFee: 300_000n, lowUtilBalance: 1_000_000_000n, highUtilBalance: 100_000_000_000n };

/** The exact local quote the sheet computes for `kaleIn` against the mock pool. */
function expectedBuyQuote(kaleIn: bigint, kaleReserve: bigint, trackReserve: bigint): bigint {
  const rec = (balance: bigint) => ({ balance, weight: 5_000_000n, scalar: 10n ** 11n });
  return quoteExactIn({
    amountIn: kaleIn,
    inRecord: rec(kaleReserve),
    outRecord: rec(trackReserve),
    fee: cometDynamicFee(kaleReserve, FEE_CFG),
  }).amountOut;
}

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

const pill = (page: Page) => page.getByRole('button', { name: /Open account menu/i });
const card = (page: Page) => page.locator('section[aria-labelledby="collect-title"]');

async function openTrade(page: Page) {
  await page.goto(`/${crosswiredSong.Id}`);
  await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('100 KALE', { timeout: 10_000 });
  return dialog;
}

test.describe('Slippage protection', () => {
  test('single swap carries min_amount_out = quote × 99%, shows "Minimum received", and re-quotes when the pool refuses', async ({
    page,
    context,
  }) => {
    await signIn(context);
    await context.addInitScript(() => {
      const w = window as unknown as {
        __smolCollectSeams: unknown;
        __swapArgs: Record<string, string>[];
        __moveMarket: () => Promise<void>;
      };
      w.__swapArgs = [];
      w.__smolCollectSeams = {
        swap: async (args: Record<string, bigint | string>) => {
          w.__swapArgs.push(Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)])));
          if (w.__swapArgs.length === 1) {
            // The market moves while the user signs; the pool's floor check fails.
            await w.__moveMarket();
            throw new Error('HostError: Error(Contract, #20) ErrLimitOut');
          }
        },
      };
    });
    const kaleReserve = KALE(1_000);
    let scenario: ChainScenario = {
      minted: [crosswiredSong.Id],
      balances: {},
      kale: 0n,
      kaleReserve,
      kaleByHolder: { [COLLECTOR]: KALE(100) },
    };
    const movedReserve = 9_000_000_000_000_000n;
    await page.exposeFunction('__moveMarket', () => {
      scenario = { ...scenario, trackReserve: movedReserve };
    });
    const stats = await installStellarMock(page, () => scenario);

    const amountIn = KALE(50);
    const q0 = expectedBuyQuote(amountIn, kaleReserve, TRACK_RESERVE);
    const min0 = minAmountOutFor(q0);
    expect(min0).toBe((q0 * 9900n) / 10000n);
    expect(min0).toBeGreaterThan(0n);
    const q1 = expectedBuyQuote(amountIn, kaleReserve, movedReserve);
    expect(q1).toBeLessThan(min0); // a >1% move: the real pool would refuse it

    await page.goto(`/${crosswiredSong.Id}`);
    await expect(pill(page)).toHaveAttribute('title', '100 KALE', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText(/Max buy/).locator('..')).toContainText('100 KALE', { timeout: 10_000 });
    await dialog.getByRole('textbox').first().fill('50');

    const minRow = dialog.locator('[data-minimum-received]');
    await expect(minRow).toContainText('Minimum received', { timeout: 10_000 });
    await expect(minRow).toContainText(`${formatAmount(min0, 7)} SMOL`);
    await expect(dialog.getByText(formatAmount(q0, 7), { exact: true })).toBeVisible();

    const readsBefore = stats.getLedgerEntries;
    await dialog.getByRole('button', { name: 'Buy SMOL' }).click();

    // Refused below the floor: nothing traded, a re-quote prompt, a fresh quote.
    const notice = dialog.locator('[data-requote-notice]');
    await expect(notice).toHaveText(/price moved more than 1% since your quote, so the trade was not made/i, {
      timeout: 10_000,
    });
    await expect(notice).toHaveAttribute('role', 'alert');
    expect(stats.getLedgerEntries, 'reserves + balances were re-read').toBeGreaterThan(readsBefore);
    await expect(minRow).toContainText(`${formatAmount(minAmountOutFor(q1), 7)} SMOL`);
    await expect(dialog.getByText(formatAmount(q1, 7), { exact: true })).toBeVisible();
    await expect(page.getByText('Bought SMOL.')).toHaveCount(0);

    const first = await page.evaluate(() => (window as unknown as { __swapArgs: Record<string, string>[] }).__swapArgs[0]);
    expect(first).toMatchObject({ amount: String(amountIn), quotedAmountOut: String(q0), minAmountOut: String(min0) });

    // Approving the refreshed quote trades with the NEW floor.
    await dialog.getByRole('button', { name: 'Buy SMOL' }).click();
    await expect(page.getByText('Bought SMOL.')).toBeVisible({ timeout: 10_000 });
    await expect(notice).toHaveCount(0);
    const second = await page.evaluate(() => (window as unknown as { __swapArgs: Record<string, string>[] }).__swapArgs[1]);
    expect(second).toMatchObject({ quotedAmountOut: String(q1), minAmountOut: String(minAmountOutFor(q1)) });
  });

  async function runBatchBuy(page: Page, context: BrowserContext, movedReserve: bigint) {
    await signIn(context);
    await context.addInitScript(() => {
      const w = window as unknown as {
        __smolCollectSeams: unknown;
        __signs: number;
        __relays: string[][];
        __moveMarket: () => Promise<void>;
      };
      w.__signs = 0;
      w.__relays = [];
      w.__smolCollectSeams = {
        buy: {
          // The market moves between approval (baseline quote) and signing.
          assemble: async () => {
            await w.__moveMarket();
            return {};
          },
          expiration: async () => 66_000_000,
          sign: async () => {
            w.__signs++;
          },
          relay: async (ids: string[]) => {
            w.__relays.push(ids);
          },
        },
      };
    });
    let scenario: ChainScenario = { minted: mintedIds, balances: {}, kale: KALE(1_000) };
    await page.exposeFunction('__moveMarket', () => {
      scenario = { ...scenario, trackReserve: movedReserve };
    });
    await installStellarMock(page, () => scenario);
    await page.goto('/mixtapes/collect-minted');
    await card(page).getByRole('button', { name: 'Buy all 8 · 264 KALE' }).click({ timeout: 10_000 });
    const sheet = page.locator('dialog[open]');
    await sheet.getByRole('button', { name: 'Collect for 264 KALE' }).click();
    return sheet;
  }

  const counts = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __signs: number; __relays: string[][] };
      return { signs: w.__signs, relays: w.__relays.length };
    });

  test('batch buy re-quotes right before signing and aborts (nothing signed) when prices moved > 2%', async ({ page, context }) => {
    const moved = (TRACK_RESERVE * 95n) / 100n; // every song quotes ~5% fewer tokens
    const sheet = await runBatchBuy(page, context, moved);
    await expect(
      sheet.getByText(/Prices moved [\d.]+% against you since you approved, so nothing was signed or charged\. Review the new prices and approve again\./)
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(await counts(page), 'no passkey prompt, no relay').toEqual({ signs: 0, relays: 0 });
  });

  test('batch buy within the 2% tolerance proceeds to one signature and one relay', async ({ page, context }) => {
    const moved = (TRACK_RESERVE * 99n) / 100n; // ~1% move: within tolerance
    const sheet = await runBatchBuy(page, context, moved);
    await expect.poll(() => counts(page), { timeout: 10_000 }).toEqual({ signs: 1, relays: 1 });
    await expect(sheet.getByText(/Prices moved/)).toHaveCount(0);
  });
});

test.describe('Quote integrity in the trade sheet', () => {
  /** Swap seam (stands in for build + passkey + send); `rejectFirst` refuses swap #1 with #20. */
  async function setup(page: Page, context: BrowserContext, rejectFirst: boolean) {
    await signIn(context);
    await context.addInitScript((reject: boolean) => {
      const w = window as unknown as {
        __smolCollectSeams: unknown;
        __swapArgs: Record<string, string>[];
        __onSwap: (n: number) => Promise<void>;
      };
      w.__swapArgs = [];
      w.__smolCollectSeams = {
        swap: async (args: Record<string, bigint | string>) => {
          w.__swapArgs.push(Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)])));
          await w.__onSwap(w.__swapArgs.length);
          if (reject && w.__swapArgs.length === 1) throw new Error('HostError: Error(Contract, #20) ErrLimitOut');
        },
      };
    }, rejectFirst);
  }
  const swapArgsOf = (page: Page) =>
    page.evaluate(() => (window as unknown as { __swapArgs: Record<string, string>[] }).__swapArgs);

  test('editing 50 → 5 hides the old minimum at once, disables submit, and trades only the fresh floor', async ({
    page,
    context,
  }) => {
    await setup(page, context, false);
    await page.exposeFunction('__onSwap', () => undefined);
    await installStellarMock(page, () => ({
      minted: [crosswiredSong.Id],
      balances: { [crosswiredSong.Id]: TOKENS(1_000) },
      kale: 0n,
      kaleReserve: KALE(1_000),
      kaleByHolder: { [COLLECTOR]: KALE(100) },
    }));
    const dialog = await openTrade(page);
    const input = dialog.getByRole('textbox').first();
    const minRow = dialog.locator('[data-minimum-received]');
    const buy = dialog.getByRole('button', { name: 'Buy SMOL' });

    await input.fill('50');
    await expect(minRow).toBeVisible({ timeout: 10_000 });
    const min50 = (await minRow.textContent()) ?? '';
    await expect(buy).toBeEnabled();

    // Quick edit: the 50-KALE minimum must vanish immediately, and Buy must not
    // be clickable with it (a click right now must not submit anything).
    await input.fill('5');
    await expect(minRow).toHaveCount(0, { timeout: 200 });
    await expect(buy).toBeDisabled({ timeout: 200 });
    await buy.click({ force: true });
    expect(await swapArgsOf(page)).toEqual([]);

    await expect(minRow).toBeVisible({ timeout: 10_000 });
    const min5 = (await minRow.textContent()) ?? '';
    expect(min5).not.toBe(min50);
    await buy.click();
    await expect(page.getByText('Bought SMOL.')).toBeVisible({ timeout: 10_000 });
    const [sent] = await swapArgsOf(page);
    expect(sent.amount).toBe(String(KALE(5)));
    expect(sent.minAmountOut).toBe(String(minAmountOutFor(BigInt(sent.quotedAmountOut))));
    expect(min5).toContain(formatAmount(BigInt(sent.minAmountOut), 7));
  });

  test('a failed reserve refresh after a rejection keeps trading disabled with Retry; only a fresh read re-enables it', async ({
    page,
    context,
  }) => {
    await setup(page, context, true);
    const movedReserve = 9_000_000_000_000_000n;
    let scenario: ChainScenario = {
      minted: [crosswiredSong.Id],
      balances: {},
      kale: 0n,
      kaleReserve: KALE(1_000),
      kaleByHolder: { [COLLECTOR]: KALE(100) },
    };
    // The market moves AND the ledger read goes down while the swap is refused.
    await page.exposeFunction('__onSwap', (n: number) => {
      if (n === 1) scenario = { ...scenario, trackReserve: movedReserve, fail: true };
    });
    const stats = await installStellarMock(page, () => scenario);
    const dialog = await openTrade(page);
    const minRow = dialog.locator('[data-minimum-received]');
    const buy = dialog.getByRole('button', { name: 'Buy SMOL' });
    await dialog.getByRole('textbox').first().fill('50');
    await expect(minRow).toBeVisible({ timeout: 10_000 });
    const rejectedMin = (await minRow.textContent()) ?? '';

    await buy.click();
    const failed = dialog.locator('[data-reserve-refresh-failed]');
    await expect(failed).toBeVisible({ timeout: 15_000 });
    await expect(failed).toHaveAttribute('role', 'alert');
    await expect(failed).toContainText("couldn't load current prices");
    // No "we refreshed the quote", no minimum, no way to resubmit the rejected quote.
    await expect(dialog.locator('[data-requote-notice]')).toHaveCount(0);
    await expect(minRow).toHaveCount(0);
    await expect(buy).toBeDisabled();
    // Editing the amount still cannot produce a quote from the stale snapshot.
    await dialog.getByRole('textbox').first().fill('40');
    await page.waitForTimeout(1_300);
    await expect(minRow).toHaveCount(0);
    await expect(buy).toBeDisabled();
    expect((await swapArgsOf(page)).length).toBe(1);

    // Retry while still down: still failed, still disabled.
    await failed.getByRole('button', { name: 'Retry' }).click();
    await expect(failed).toBeVisible({ timeout: 15_000 });
    await expect(buy).toBeDisabled();

    // The ledger recovers: Retry reads FRESH reserves, then re-quotes.
    scenario = { ...scenario, fail: false };
    const readsBefore = stats.getLedgerEntries;
    await failed.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.locator('[data-requote-notice]')).toBeVisible({ timeout: 10_000 });
    await expect(failed).toHaveCount(0);
    expect(stats.getLedgerEntries).toBeGreaterThan(readsBefore);
    await expect(minRow).toBeVisible();
    await expect(minRow).not.toHaveText(rejectedMin);
    await expect(buy).toBeEnabled();
    await buy.click();
    await expect(page.getByText('Bought SMOL.')).toBeVisible({ timeout: 10_000 });
    const args = await swapArgsOf(page);
    expect(args).toHaveLength(2);
    expect(args[1].amount).toBe(String(KALE(40)));
    expect(BigInt(args[1].minAmountOut)).toBe(minAmountOutFor(BigInt(args[1].quotedAmountOut)));
  });
});
