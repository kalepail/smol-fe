import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CometQuoteError,
  cometDynamicFee,
  cometMaxIn,
  fitsMaxIn,
  quoteExactIn,
  type CometFeeConfig,
} from '../../src/utils/cometQuote.ts';
import { BUY_COST_STROOPS } from '../../src/utils/mixtapePricing.ts';

// Factory config (Report 30 §1.1 / Report 31): 5%–95% dynamic fee, 100 → 70,000 KALE.
const FACTORY_FEE: CometFeeConfig = {
  minFee: 500_000n,
  maxFee: 9_500_000n,
  lowUtilBalance: 1_000_000_000n,
  highUtilBalance: 700_000_000_000n,
};
const SCALAR = 10n ** 11n;
const WEIGHT = 5_000_000n;

test('Report 31 parity: 33 KALE into a fresh 100 KALE / 990M pool', () => {
  const kale = { balance: 1_000_000_000n, weight: WEIGHT, scalar: SCALAR };
  const track = { balance: 9_900_000_000_000_000n, weight: WEIGHT, scalar: SCALAR };
  const fee = cometDynamicFee(kale.balance, FACTORY_FEE);
  assert.equal(fee, 9_500_000n, 'at/below 100 KALE the pool charges 95%');
  const quote = quoteExactIn({ amountIn: 330_000_000n, inRecord: kale, outRecord: track, fee });
  assert.equal(quote.amountOut, 160_698_475_159_862n);
});

test('Report 31 parity: drained/grown pool CBIWX… (fee 9,495,858)', () => {
  const kale = { balance: 1_321_750_000n, weight: WEIGHT, scalar: SCALAR };
  const track = { balance: 9_739_301_524_840_138n, weight: WEIGHT, scalar: SCALAR };
  const fee = cometDynamicFee(kale.balance, FACTORY_FEE);
  assert.equal(fee, 9_495_858n);
  const quote = quoteExactIn({ amountIn: BUY_COST_STROOPS, inRecord: kale, outRecord: track, fee });
  assert.equal(quote.amountOut, 121_063_443_788_685n);
});

test('dynamic fee clamps to min above the high-utilisation balance', () => {
  assert.equal(cometDynamicFee(800_000_000_000n, FACTORY_FEE), 500_000n);
  assert.equal(cometDynamicFee(1n, FACTORY_FEE), 9_500_000n);
  assert.equal(cometDynamicFee(5n, { ...FACTORY_FEE, highUtilBalance: 1n }), 9_500_000n, 'degenerate → maxFee');
});

test('maxIn guard (C-12): 33 KALE fits a 100 KALE pool, not a 98 KALE pool', () => {
  assert.equal(cometMaxIn(1_000_000_000n), 333_333_400n);
  assert.equal(fitsMaxIn(1_000_000_000n, BUY_COST_STROOPS), true);
  assert.equal(fitsMaxIn(980_000_000n, BUY_COST_STROOPS), false);
  assert.equal(fitsMaxIn(1_000_000_000n, 0n), false);

  const kale = { balance: 980_000_000n, weight: WEIGHT, scalar: SCALAR };
  const track = { balance: 9_900_000_000_000_000n, weight: WEIGHT, scalar: SCALAR };
  assert.throws(
    () => quoteExactIn({ amountIn: BUY_COST_STROOPS, inRecord: kale, outRecord: track, fee: 9_500_000n }),
    (err: unknown) => err instanceof CometQuoteError && err.issue === 'aboveMaxIn'
  );
});

test('unequal weights are gated as unsupported (no silent wrong quote)', () => {
  assert.throws(
    () =>
      quoteExactIn({
        amountIn: 1n,
        inRecord: { balance: 10n ** 9n, weight: 8_000_000n, scalar: SCALAR },
        outRecord: { balance: 10n ** 9n, weight: 2_000_000n, scalar: SCALAR },
        fee: 0n,
      }),
    (err: unknown) => err instanceof CometQuoteError && err.issue === 'unsupported'
  );
});
