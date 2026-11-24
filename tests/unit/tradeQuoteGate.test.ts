import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSubmitTrade,
  isActionableQuote,
  quoteMatchesInput,
  refreshThenRequote,
} from '../../src/utils/tradeQuoteGate.ts';
import { computeAmmBuyCap } from '../../src/utils/tradeCalculations.ts';

const settled = {
  mode: 'buy' as const,
  amount: 50_0000000n,
  quotedFor: { mode: 'buy' as const, amount: 50_0000000n },
  quotedAmountOut: 45_445_451_1011097n,
  quoteLoading: false,
  reserves: 'fresh' as const,
  submitting: false,
};

test('P2: a quote only matches the exact (mode, amount) it was computed for', () => {
  assert.equal(quoteMatchesInput(settled), true);
  // Edited 50 → 5 KALE: the 50-KALE quote (and its minimum) is not this input's.
  assert.equal(quoteMatchesInput({ ...settled, amount: 5_0000000n }), false);
  // Flipped buy → sell with the same number.
  assert.equal(quoteMatchesInput({ ...settled, mode: 'sell' }), false);
  assert.equal(quoteMatchesInput({ ...settled, quotedFor: null }), false);
  assert.equal(quoteMatchesInput({ ...settled, quotedAmountOut: null }), false);
  assert.equal(quoteMatchesInput({ ...settled, quotedAmountOut: 0n }), false);
  assert.equal(quoteMatchesInput({ ...settled, amount: null }), false);
  assert.equal(quoteMatchesInput({ ...settled, amount: 0n, quotedFor: { mode: 'buy', amount: 0n } }), false);
});

test('P2: submit is enabled only for a settled, matching quote from fresh reserves', () => {
  assert.equal(canSubmitTrade(settled), true);
  assert.equal(canSubmitTrade({ ...settled, amount: 5_0000000n }), false, 'stale quote after an edit');
  assert.equal(canSubmitTrade({ ...settled, mode: 'sell' }), false, 'stale quote after a flip');
  assert.equal(canSubmitTrade({ ...settled, quoteLoading: true }), false, 'quote still loading');
  assert.equal(canSubmitTrade({ ...settled, submitting: true }), false);
  assert.equal(canSubmitTrade({ ...settled, reserves: 'refreshing' }), false, 'refresh in flight');
  assert.equal(canSubmitTrade({ ...settled, reserves: 'failed' }), false, 'refresh failed: Retry first');
});

test('P2: a failed reserve refresh after a rejection never re-quotes from the stale snapshot', async () => {
  let requoted = 0;
  const outcome = await refreshThenRequote({
    refresh: async () => {
      throw new Error('getLedgerEntries 500');
    },
    requote: async () => {
      requoted++;
      return true;
    },
  });
  assert.equal(outcome, 'refresh-failed');
  assert.equal(requoted, 0);
});

test('P2: a successful refresh re-quotes; a superseded one (account switch) does not', async () => {
  let requoted = 0;
  const requote = async () => {
    requoted++;
    return true;
  };
  assert.equal(await refreshThenRequote({ refresh: async () => true, requote }), 'requoted');
  assert.equal(requoted, 1);
  assert.equal(await refreshThenRequote({ refresh: async () => false, requote }), 'superseded');
  assert.equal(requoted, 1);
});

// FE-1 pass 3, P2: recovery reported "We refreshed the quote" when the new
// reserves made the input invalid (max-buy error, Buy disabled).
const actionable = {
  mode: 'buy' as const,
  amount: 50_0000000n,
  quotedFor: { mode: 'buy' as const, amount: 50_0000000n },
  quotedAmountOut: 45_445_451_1011097n,
  quoteLoading: false,
  quoteError: null,
  reserves: 'fresh' as const,
};

test('pass 3: only a settled, positive quote for exactly the current input is actionable', () => {
  assert.equal(isActionableQuote(actionable), true);
  // 50 KALE above the new max buy: the validation return leaves no quote.
  assert.equal(
    isActionableQuote({ ...actionable, quotedFor: null, quotedAmountOut: null, quoteError: 'Amount exceeds max buy limit.' }),
    false
  );
  assert.equal(isActionableQuote({ ...actionable, quoteError: 'Amount exceeds max buy limit.' }), false);
  assert.equal(isActionableQuote({ ...actionable, quoteLoading: true }), false);
  assert.equal(isActionableQuote({ ...actionable, quotedAmountOut: 0n }), false);
  assert.equal(isActionableQuote({ ...actionable, amount: 40_0000000n }), false, 'input edited meanwhile');
  assert.equal(isActionableQuote({ ...actionable, reserves: 'failed' }), false);
});

test('pass 3: 50 KALE, pool KALE reserve drops to 30 on rejection → "unquoted", never "requoted"', async () => {
  // The real cap the sheet computes from a 30-KALE reserve is below 50 KALE.
  const cap = computeAmmBuyCap(30_0000000n);
  assert.ok(cap < 50_0000000n, `cap ${cap} must be below 50 KALE`);
  let quoteError: string | null = null;
  const outcome = await refreshThenRequote({
    refresh: async () => true, // the fresh read succeeded
    requote: async () => {
      // What MintTradeModal.runSimulation does for amount > max buy.
      quoteError = 50_0000000n > cap ? 'Amount exceeds max buy limit.' : null;
      return isActionableQuote({ ...actionable, quotedFor: null, quotedAmountOut: null, quoteError });
    },
  });
  assert.equal(quoteError, 'Amount exceeds max buy limit.');
  assert.equal(outcome, 'unquoted');
  assert.equal(canSubmitTrade({ ...actionable, quotedFor: null, quotedAmountOut: null, quoteLoading: false, submitting: false }), false);
});
