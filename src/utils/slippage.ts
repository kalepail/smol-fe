/**
 * Slippage protection (PURE: no I/O, no Stellar SDK — safe to import statically).
 *
 * - Single swaps (`swap_exact_amount_in`) carry an on-chain floor:
 *   `min_amount_out = quote × 99%` (floor, clamped to ≥ 1 for a positive quote),
 *   so the pool rejects the swap (Comet `ErrLimitOut`) instead of filling it at
 *   a worse price than the user reviewed.
 * - Mixtape batch buys (`swap_them_in`) have no min-out argument, so the client
 *   re-quotes immediately before signing and aborts — nothing signed, nothing
 *   charged — if the aggregate quote moved against the buyer by more than 2%.
 */

import { ContractCallError } from './contractResult.ts';

export const BPS_DENOMINATOR = 10_000n;
/** Single-swap tolerance: 1% (100 bps). */
export const SINGLE_SWAP_SLIPPAGE_BPS = 100n;
/** Batch-buy re-quote tolerance: 2% (200 bps). */
export const BATCH_REQUOTE_MAX_ADVERSE_BPS = 200n;

/**
 * Minimum acceptable output for a quoted exact-in swap. `0n` only when there is
 * no positive quote; a positive quote never produces a 0 floor.
 */
export function minAmountOutFor(quotedAmountOut: bigint, slippageBps: bigint = SINGLE_SWAP_SLIPPAGE_BPS): bigint {
  if (slippageBps < 0n || slippageBps >= BPS_DENOMINATOR) {
    throw new RangeError('Slippage must be in [0, 10000) bps');
  }
  if (quotedAmountOut <= 0n) return 0n;
  const min = (quotedAmountOut * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
  return min < 1n ? 1n : min;
}

/**
 * How far `next` moved AGAINST the buyer relative to `previous`, in bps
 * (rounded up, so 200.01 bps counts as 201). A better or equal quote is 0.
 */
export function adverseMoveBps(previous: bigint, next: bigint): bigint {
  if (previous <= 0n) throw new RangeError('Baseline quote must be positive');
  if (next >= previous) return 0n;
  const drop = (previous - next) * BPS_DENOMINATOR;
  return (drop + previous - 1n) / previous;
}

/** Comet contract error codes that mean "the price moved past your limit". */
export const COMET_ERR_LIMIT_OUT = 20;
export const COMET_ERR_LIMIT_PRICE = 23;
const SLIPPAGE_CODES = new Set([COMET_ERR_LIMIT_OUT, COMET_ERR_LIMIT_PRICE]);
const SLIPPAGE_ERROR_RE = /Error\(Contract,\s*#(?:20|23)\)|\bErrLimitOut\b|\bErrLimitPrice\b/;

/**
 * True for Comet `ErrLimitOut` (#20) / `ErrLimitPrice` (#23) however it
 * surfaces: a `ContractCallError` with its contract `code` (from
 * the simulation, see `readSimulatedCall`), an SDK `Err` payload
 * (`{ message: 'ErrLimitOut' }`), or a host / submit error string. Follows
 * `cause` chains (one wrapper deep is common: relay → submit → host error).
 */
export function isSlippageError(error: unknown, depth = 0): boolean {
  if (error === null || error === undefined || depth > 4) return false;
  if (error instanceof SlippageExceededError) return true;
  if (typeof error === 'string') return SLIPPAGE_ERROR_RE.test(error);
  if (typeof error !== 'object') return false;
  // Only a contract-call failure's code counts (a DOMException AbortError is also `code` 20).
  if (error instanceof ContractCallError) {
    if (error.code !== null) return SLIPPAGE_CODES.has(error.code);
  }
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  const text = `${typeof name === 'string' ? name : ''} ${typeof message === 'string' ? message : ''}`;
  if (SLIPPAGE_ERROR_RE.test(text)) return true;
  return isSlippageError((error as { cause?: unknown }).cause, depth + 1);
}

export const SINGLE_SWAP_REQUOTE_COPY =
  'The price moved more than 1% since your quote, so the trade was not made. We refreshed the quote — review it and try again.';

/** The pool refused the swap AND the current amount has no valid quote at the new prices. */
export const SINGLE_SWAP_REJECTED_COPY =
  'The price moved more than 1% since your quote, so the trade was not made. Adjust the amount for the new prices.';

/** A single swap the pool refused because output fell below `min_amount_out`. */
export class SlippageExceededError extends Error {
  readonly minAmountOut: bigint;
  constructor(minAmountOut: bigint, options?: { cause?: unknown }) {
    super(SINGLE_SWAP_REQUOTE_COPY, options);
    this.name = 'SlippageExceededError';
    this.minAmountOut = minAmountOut;
  }
}

export type BatchQuoteIssue = 'moved' | 'unavailable';

/** A batch buy aborted BEFORE signing because the re-quote moved or failed. */
export class QuoteMovedError extends Error {
  readonly issue: BatchQuoteIssue;
  readonly baseline: bigint | null;
  readonly requote: bigint | null;
  readonly movedBps: bigint | null;
  constructor(input: { issue: BatchQuoteIssue; baseline?: bigint | null; requote?: bigint | null; movedBps?: bigint | null }) {
    const message =
      input.issue === 'moved'
        ? `Prices moved ${formatBps(input.movedBps ?? 0n)} against you since you approved, so nothing was signed or charged. Review the new prices and approve again.`
        : "We couldn't re-check current prices, so nothing was signed or charged. Try again in a moment.";
    super(message);
    this.name = 'QuoteMovedError';
    this.issue = input.issue;
    this.baseline = input.baseline ?? null;
    this.requote = input.requote ?? null;
    this.movedBps = input.movedBps ?? null;
  }
}

/** `250n` → `"2.5%"`, `201n` → `"2.01%"`. */
export function formatBps(bps: bigint): string {
  const whole = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}%` : `${whole}%`;
}

/**
 * Batch-buy guard: throws `QuoteMovedError` when the re-quote is missing or
 * moved adversely by more than `maxAdverseBps` (default 2%). Returns the move.
 */
export function assertBatchQuoteWithinTolerance(
  baseline: bigint | null,
  requote: bigint | null,
  maxAdverseBps: bigint = BATCH_REQUOTE_MAX_ADVERSE_BPS
): bigint {
  if (baseline === null || requote === null || baseline <= 0n) {
    throw new QuoteMovedError({ issue: 'unavailable', baseline, requote });
  }
  const moved = adverseMoveBps(baseline, requote);
  if (moved > maxAdverseBps) {
    throw new QuoteMovedError({ issue: 'moved', baseline, requote, movedBps: moved });
  }
  return moved;
}
