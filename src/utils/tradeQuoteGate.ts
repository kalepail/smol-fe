/**
 * When may the trade sheet show a quote and submit a swap? (PURE — used by
 * MintTradeModal and unit tests.)
 *
 * - The quote (and its "Minimum received" floor) belongs to ONE exact
 *   `(mode, amount)`. Editing the amount or flipping buy/sell invalidates it at
 *   once; submit stays disabled until a fresh quote for exactly the current
 *   input has settled, so the swap can only carry a floor the user saw.
 * - After the pool refused a swap below its floor, the quote may only come
 *   back from a SUCCESSFUL fresh reserve read. While that read is in flight or
 *   after it failed, no quote is shown and submit stays disabled (Retry).
 */
export type TradeMode = 'buy' | 'sell';
export type ReserveFreshness = 'fresh' | 'refreshing' | 'failed';

export interface QuoteFor {
  mode: TradeMode;
  amount: bigint;
}

export function quoteMatchesInput(input: {
  mode: TradeMode;
  amount: bigint | null;
  quotedFor: QuoteFor | null;
  quotedAmountOut: bigint | null;
}): boolean {
  const { mode, amount, quotedFor, quotedAmountOut } = input;
  return (
    amount !== null &&
    amount > 0n &&
    quotedAmountOut !== null &&
    quotedAmountOut > 0n &&
    quotedFor !== null &&
    quotedFor.mode === mode &&
    quotedFor.amount === amount
  );
}

export function canSubmitTrade(input: {
  mode: TradeMode;
  amount: bigint | null;
  quotedFor: QuoteFor | null;
  quotedAmountOut: bigint | null;
  quoteLoading: boolean;
  reserves: ReserveFreshness;
  submitting: boolean;
}): boolean {
  if (input.submitting || input.quoteLoading || input.reserves !== 'fresh') return false;
  return quoteMatchesInput(input);
}

/**
 * - `requoted`: a fresh read succeeded AND the re-quote settled with a positive
 *   quote for exactly the current input — the only outcome that may say "we
 *   refreshed the quote".
 * - `unquoted`: the fresh read succeeded but the input has no actionable quote
 *   under the new reserves (e.g. above the new max buy): show the validation
 *   error, keep submit disabled, never claim a refreshed quote.
 */
export type RequoteOutcome = 'requoted' | 'unquoted' | 'refresh-failed' | 'superseded';

/**
 * After a slippage rejection: re-read reserves, and ONLY if that read
 * succeeded, re-quote. A failed read never falls back to the old snapshot.
 * `refresh` resolves `true` when a fresh snapshot was applied, `false` when the
 * dialog moved on (account switch / reload) and the result was dropped.
 * `requote` resolves `true` only when it settled with an actionable quote
 * matching the current input (see `quoteMatchesInput`).
 */
export async function refreshThenRequote(steps: {
  refresh: () => Promise<boolean>;
  requote: () => Promise<boolean>;
}): Promise<RequoteOutcome> {
  let applied: boolean;
  try {
    applied = await steps.refresh();
  } catch {
    return 'refresh-failed';
  }
  if (!applied) return 'superseded';
  return (await steps.requote()) ? 'requoted' : 'unquoted';
}

/**
 * Is the shown quote settled and actionable for exactly the current input?
 * (Positive, for this mode and amount, from fresh reserves, no validation
 * error, nothing still loading.)
 */
export function isActionableQuote(input: {
  mode: TradeMode;
  amount: bigint | null;
  quotedFor: QuoteFor | null;
  quotedAmountOut: bigint | null;
  quoteLoading: boolean;
  quoteError: string | null;
  reserves: ReserveFreshness;
}): boolean {
  if (input.quoteLoading || input.quoteError !== null || input.reserves !== 'fresh') return false;
  return quoteMatchesInput(input);
}

export const RESERVE_REFRESH_FAILED_COPY =
  "The price moved, and we couldn't load current prices to re-quote, so trading is paused. Nothing was traded. Check your connection and retry.";
