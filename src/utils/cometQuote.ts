/**
 * Exact Comet (Balancer-style) quote math for SMOL song pools.
 *
 * PURE: zero I/O, zero Stellar SDK imports, bigint throughout. Mirrors the
 * deployed Comet executable (hash 61e1fc54…, Report 31) for the verified
 * equal-weight (50/50), seven-decimal configuration. Any other weight ratio is
 * rejected as `unsupported` so callers can fall back to a simulation.
 *
 * Parity fixture (Report 31, ledger 65,635,380):
 *   KALE reserve 1,000,000,000 · track reserve 9,900,000,000,000,000 ·
 *   weights 5,000,000 · scalars 10^11 · fee 95% · dx = 330,000,000
 *   → 160,698,475,159,862 track stroops (identical to an unsigned simulation).
 */

/** Comet fixed-point base used for fees, ratios and weights (7 decimals). */
export const COMET_D = 10n ** 7n;
/** Comet BONE used inside the swap math. */
export const COMET_Q = 10n ** 18n;
/** Max-in ratio: an exact-in swap may spend at most ~1/3 of the input reserve. */
export const COMET_MAX_IN_RATIO = COMET_D / 3n + 1n;

export interface CometRecord {
  balance: bigint;
  weight: bigint;
  scalar: bigint;
}

export interface CometFeeConfig {
  minFee: bigint;
  maxFee: bigint;
  lowUtilBalance: bigint;
  highUtilBalance: bigint;
}

export type QuoteIssue = 'invalidInput' | 'aboveMaxIn' | 'unsupported' | 'emptyPool';

export class CometQuoteError extends RangeError {
  readonly issue: QuoteIssue;
  constructor(issue: QuoteIssue, message: string) {
    super(message);
    this.name = 'CometQuoteError';
    this.issue = issue;
  }
}

/** Largest exact input the pool accepts for this input reserve (floor). */
export function cometMaxIn(inReserve: bigint): bigint {
  if (inReserve <= 0n) return 0n;
  return (inReserve * COMET_MAX_IN_RATIO) / COMET_D;
}

/** True when `amountIn` fits under the pool's 1/3 max-in ratio (C-12). */
export function fitsMaxIn(inReserve: bigint, amountIn: bigint): boolean {
  return amountIn > 0n && amountIn <= cometMaxIn(inReserve);
}

/**
 * Dynamic swap fee from the tracked reserve. Utilisation and fee are floored
 * exactly as the contract does; a degenerate config returns `maxFee`.
 */
export function cometDynamicFee(trackedReserve: bigint, cfg: CometFeeConfig): bigint {
  const { minFee, maxFee, lowUtilBalance: low, highUtilBalance: high } = cfg;
  if (high <= low || maxFee < minFee) return maxFee;
  const clamped = trackedReserve < low ? low : trackedReserve > high ? high : trackedReserve;
  const utilization = ((clamped - low) * COMET_D) / (high - low);
  return maxFee - ((maxFee - minFee) * utilization) / COMET_D;
}

export interface ExactInQuote {
  amountIn: bigint;
  amountOut: bigint;
  fee: bigint;
  maxIn: bigint;
}

/**
 * Exact-in output for an equal-weight pool. Throws `CometQuoteError` when the
 * input is outside the pool limits or the pool shape is unsupported.
 */
export function quoteExactIn(params: {
  amountIn: bigint;
  inRecord: CometRecord;
  outRecord: CometRecord;
  fee: bigint;
}): ExactInQuote {
  const { amountIn: dx, inRecord, outRecord, fee } = params;
  if (inRecord.weight !== outRecord.weight || inRecord.weight <= 0n) {
    throw new CometQuoteError('unsupported', 'Only equal-weight pools are supported');
  }
  if (inRecord.scalar <= 0n || outRecord.scalar <= 0n) {
    throw new CometQuoteError('unsupported', 'Invalid token scalar');
  }
  if (fee < 0n || fee >= COMET_D) {
    throw new CometQuoteError('unsupported', 'Fee outside [0, 1)');
  }
  if (inRecord.balance <= 0n || outRecord.balance <= 0n) {
    throw new CometQuoteError('emptyPool', 'Pool has no liquidity');
  }
  const maxIn = cometMaxIn(inRecord.balance);
  if (dx <= 0n) throw new CometQuoteError('invalidInput', 'Input must be positive');
  if (dx > maxIn) throw new CometQuoteError('aboveMaxIn', 'Input above pool limit');

  const x = inRecord.balance * inRecord.scalar;
  const y = outRecord.balance * outRecord.scalar;
  const adjusted = (dx * inRecord.scalar * (COMET_D - fee)) / COMET_D;
  const base = (x * COMET_Q) / (x + adjusted);
  const amountOut = (y * (COMET_Q - base)) / COMET_Q / outRecord.scalar;

  return { amountIn: dx, amountOut, fee, maxIn };
}
