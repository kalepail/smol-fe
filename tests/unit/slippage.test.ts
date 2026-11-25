import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adverseMoveBps,
  assertBatchQuoteWithinTolerance,
  formatBps,
  isSlippageError,
  minAmountOutFor,
  QuoteMovedError,
  SlippageExceededError,
} from '../../src/utils/slippage.ts';
import { quoteExactIn } from '../../src/utils/cometQuote.ts';

test('single swap: min_amount_out = quote × 9900 / 10000 (floor)', () => {
  assert.equal(minAmountOutFor(10_000n), 9_900n);
  assert.equal(minAmountOutFor(12_345n), (12_345n * 9_900n) / 10_000n);
  assert.equal(minAmountOutFor(160_698_475_159_862n), 159_091_490_408_263n);
  assert.equal(minAmountOutFor(10_000n, 50n), 9_950n, 'custom tolerance');
});

test('single swap: a positive quote never yields a 0 floor (clamped to 1), no quote yields 0', () => {
  assert.equal(minAmountOutFor(1n), 1n);
  assert.equal(minAmountOutFor(50n), 49n);
  assert.equal(minAmountOutFor(100n), 99n);
  assert.equal(minAmountOutFor(0n), 0n);
  assert.equal(minAmountOutFor(-5n), 0n);
  assert.throws(() => minAmountOutFor(100n, 10_000n), RangeError);
  assert.throws(() => minAmountOutFor(100n, -1n), RangeError);
});

test('single swap: the floor rejects exactly the fills > 1% worse than the Report 31 parity quote', () => {
  const quote = quoteExactIn({
    amountIn: 330_000_000n,
    inRecord: { balance: 1_000_000_000n, weight: 5_000_000n, scalar: 10n ** 11n },
    outRecord: { balance: 9_900_000_000_000_000n, weight: 5_000_000n, scalar: 10n ** 11n },
    fee: 9_500_000n,
  }).amountOut;
  assert.equal(quote, 160_698_475_159_862n);
  const floor = minAmountOutFor(quote);
  assert.ok(floor <= quote && quote - floor <= quote / 100n + 1n, "floor is within 1% (+1 stroop rounding)");
  assert.ok((quote * 98n) / 100n < floor, 'a 2% worse fill is refused');
});

test('contract limit errors (ErrLimitOut #20, ErrLimitPrice #23) are classified as slippage', () => {
  assert.equal(isSlippageError(new Error('HostError: Error(Contract, #20)')), true);
  assert.equal(isSlippageError(new Error('simulation failed: Error(Contract, #23)')), true);
  assert.equal(isSlippageError(new Error('ErrLimitOut')), true);
  assert.equal(isSlippageError('Error(Contract, #20)'), true);
  assert.equal(isSlippageError(new SlippageExceededError(1n)), true);
  assert.equal(isSlippageError(new Error('Error(Contract, #2)')), false, 'ErrNegative');
  assert.equal(isSlippageError(new Error('Error(Contract, #200)')), false);
  assert.equal(isSlippageError(new Error('Error(Contract, #29) ErrInsufficientBalance')), false);
  assert.equal(isSlippageError(new Error('user cancelled passkey')), false);
  assert.equal(isSlippageError(undefined), false);
});

test('SlippageExceededError carries the floor and an actionable re-quote message', () => {
  const error = new SlippageExceededError(99n, { cause: new Error('Error(Contract, #20)') });
  assert.equal(error.minAmountOut, 99n);
  assert.match(error.message, /more than 1%.*not made.*refreshed the quote/);
  assert.ok(error.cause instanceof Error);
});

test('batch: adverse move in bps (rounded up), favourable moves are 0', () => {
  assert.equal(adverseMoveBps(10_000n, 10_000n), 0n);
  assert.equal(adverseMoveBps(10_000n, 12_000n), 0n);
  assert.equal(adverseMoveBps(10_000n, 9_800n), 200n);
  assert.equal(adverseMoveBps(10_000n, 9_799n), 201n);
  assert.equal(adverseMoveBps(1_000_000n, 979_999n), 201n, '2.0001% rounds up to 201 bps');
  assert.equal(adverseMoveBps(3n, 2n), 3_334n);
  assert.throws(() => adverseMoveBps(0n, 1n), RangeError);
});

test('batch: ≤ 2% adverse proceeds, > 2% aborts with an actionable re-quote message', () => {
  assert.equal(assertBatchQuoteWithinTolerance(1_000_000n, 1_000_000n), 0n);
  assert.equal(assertBatchQuoteWithinTolerance(1_000_000n, 1_050_000n), 0n, 'better prices proceed');
  assert.equal(assertBatchQuoteWithinTolerance(1_000_000n, 980_000n), 200n, 'exactly 2% proceeds');
  assert.throws(
    () => assertBatchQuoteWithinTolerance(1_000_000n, 979_999n),
    (error: unknown) =>
      error instanceof QuoteMovedError &&
      error.issue === 'moved' &&
      error.movedBps === 201n &&
      error.baseline === 1_000_000n &&
      error.requote === 979_999n &&
      /Prices moved 2\.01% against you.*nothing was signed or charged.*approve again/.test(error.message)
  );
  assert.throws(
    () => assertBatchQuoteWithinTolerance(8n * 160_698_475_159_862n, 8n * 152_663_551_401_869n),
    /Prices moved 5% against you/
  );
});

test('batch: a missing baseline or re-quote fails closed (nothing signed)', () => {
  for (const [a, b] of [
    [null, 1n],
    [1n, null],
    [0n, 1n],
  ] as const) {
    assert.throws(
      () => assertBatchQuoteWithinTolerance(a, b),
      (error: unknown) => error instanceof QuoteMovedError && error.issue === 'unavailable' && /couldn't re-check/.test(error.message)
    );
  }
});

test('formatBps', () => {
  assert.equal(formatBps(0n), '0%');
  assert.equal(formatBps(200n), '2%');
  assert.equal(formatBps(201n), '2.01%');
  assert.equal(formatBps(250n), '2.5%');
  assert.equal(formatBps(1_234n), '12.34%');
});
