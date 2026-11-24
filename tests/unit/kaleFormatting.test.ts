import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCompactKaleBalance,
  formatKaleBalance,
  formatKaleBalanceWithSuffix,
} from '../../src/utils/kaleFormatting.ts';

const KALE = (n: bigint | number) => BigInt(n) * 10_000_000n;

test('formatKaleBalance: exact BigInt math with grouping and trimmed fraction', () => {
  assert.equal(formatKaleBalance(0n), '0');
  assert.equal(formatKaleBalance(1n), '0.0000001');
  assert.equal(formatKaleBalance(KALE(1)), '1');
  assert.equal(formatKaleBalance(KALE(1_000)), '1,000');
  assert.equal(formatKaleBalance(12_345_678_9_000_000n), '12,345,678.9');
  assert.equal(formatKaleBalance(KALE(450) + 5_000_000n), '450.5');
  assert.equal(formatKaleBalance(-KALE(1_234) - 1n), '-1,234.0000001');
});

test('formatKaleBalance: no precision loss above Number.MAX_SAFE_INTEGER', () => {
  // 2^53 + 1 stroops cannot be represented by a JS number.
  const unsafe = 9_007_199_254_740_993n;
  assert.equal(formatKaleBalance(unsafe), '900,719,925.4740993');
  const huge = 123_456_789_012_345_678_901_234_567n;
  assert.equal(formatKaleBalance(huge), '12,345,678,901,234,567,890.1234567');
});

test('formatKaleBalance: custom decimals', () => {
  assert.equal(formatKaleBalance(12_345n, 2), '123.45');
  assert.equal(formatKaleBalance(12_345n, 0), '12,345');
  assert.equal(formatKaleBalanceWithSuffix(KALE(100)), '100 KALE');
});

test('formatCompactKaleBalance: zero, dust and sub-1000 values', () => {
  assert.equal(formatCompactKaleBalance(0n), '0');
  assert.equal(formatCompactKaleBalance(1n), '<0.01');
  assert.equal(formatCompactKaleBalance(99_999n), '<0.01');
  assert.equal(formatCompactKaleBalance(100_000n), '0.01');
  assert.equal(formatCompactKaleBalance(KALE(450)), '450');
  assert.equal(formatCompactKaleBalance(KALE(12) + 5_000_000n), '12.5');
  assert.equal(formatCompactKaleBalance(KALE(12) + 3_456_789n), '12.34');
  // Truncates, never rounds up into the next tier.
  assert.equal(formatCompactKaleBalance(KALE(1_000) - 1n), '999.99');
});

test('formatCompactKaleBalance: K / M / B / T with 3 significant digits, truncated', () => {
  assert.equal(formatCompactKaleBalance(KALE(1_000)), '1K');
  assert.equal(formatCompactKaleBalance(KALE(1_250)), '1.25K');
  assert.equal(formatCompactKaleBalance(KALE(1_259)), '1.25K');
  assert.equal(formatCompactKaleBalance(KALE(12_400)), '12.4K');
  assert.equal(formatCompactKaleBalance(KALE(12_499)), '12.4K');
  assert.equal(formatCompactKaleBalance(KALE(450_000)), '450K');
  assert.equal(formatCompactKaleBalance(KALE(999_999)), '999K');
  assert.equal(formatCompactKaleBalance(KALE(1_000_000)), '1M');
  assert.equal(formatCompactKaleBalance(KALE(1_200_000)), '1.2M');
  assert.equal(formatCompactKaleBalance(KALE(2_500_000_000)), '2.5B');
  assert.equal(formatCompactKaleBalance(KALE(7_000_000_000_000)), '7T');
  assert.equal(formatCompactKaleBalance(KALE(1_234_000_000_000_000n)), '1,234T');
  assert.equal(formatCompactKaleBalance(-KALE(1_250)), '-1.25K');
});

test('formatCompactKaleBalance: exact above Number.MAX_SAFE_INTEGER', () => {
  assert.equal(formatCompactKaleBalance(9_007_199_254_740_993n), '900M');
  assert.equal(formatCompactKaleBalance(KALE(123_456_789n)), '123M');
});
