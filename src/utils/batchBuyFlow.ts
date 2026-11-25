/**
 * Ordering of a quote-guarded batch buy (PURE: no SDK, no wallet import — every
 * boundary is injected, so the ordering itself is unit-tested).
 *
 *   baseline quote → assemble → signature expiry → PREPARE WALLET
 *     → final re-quote (≤ 2% adverse) → sign (prepared wallet)
 *     → relay: [Turnstile…] → pre-dispatch guard (ownership + `submitting`) → POST
 *
 * The wallet is restored BEFORE the final re-quote: restoring can take seconds
 * (passkey-kit probes the RPC), and the price must be checked after that wait,
 * not before it. Signing then reuses the prepared wallet, so there is no second
 * restore window between the price check and the passkey prompt. Any abort
 * before `sign` (quote moved / unavailable, wallet failure) signs nothing and
 * relays nothing.
 *
 * The pre-dispatch guard is handed TO the relay, which runs it synchronously
 * after its own asynchronous prerequisites (the Turnstile challenge) and
 * immediately before the POST. So `submitting` is never recorded while the
 * relay is still waiting on Turnstile, and nothing (a login as another
 * account, another tab taking over) can slip in between the guard and the
 * request.
 */
import { assertBatchQuoteWithinTolerance, QuoteMovedError } from './slippage.ts';
import { runDispatchGuard } from './relayDispatch.ts';

export interface GuardedBatchSteps<Tx, W> {
  quote: (phase: 'baseline' | 'requote') => Promise<bigint | null>;
  assemble: () => Promise<Tx>;
  expiration: () => Promise<number>;
  prepareWallet: () => Promise<W>;
  sign: (tx: Tx, wallet: W, expiration: number) => Promise<void>;
  /**
   * SYNCHRONOUS: proves the attempt still owns the step and durably records
   * `submitting`. Runs only inside the relay's `beforeDispatch`.
   */
  beforeSubmit: (info: { expiresAtLedger: number }) => void;
  /**
   * Relay the signed tx. It MUST call `beforeDispatch()` synchronously
   * immediately before its POST (after Turnstile, zero awaits in between) and
   * send nothing if it throws.
   */
  relay: (tx: Tx, wallet: W, beforeDispatch: () => void) => Promise<void>;
}

export async function runGuardedBatchBuy<Tx, W>(steps: GuardedBatchSteps<Tx, W>): Promise<void> {
  const baseline = await steps.quote('baseline');
  if (baseline === null) throw new QuoteMovedError({ issue: 'unavailable' });

  const tx = await steps.assemble();
  const expiration = await steps.expiration();

  // Restore / verify the passkey wallet FIRST (slow), then take the final quote.
  const wallet = await steps.prepareWallet();

  // Immediately before signing: > 2% adverse (or no quote) ⇒ abort, nothing signed.
  assertBatchQuoteWithinTolerance(baseline, await steps.quote('requote'));

  await steps.sign(tx, wallet, expiration);

  // No POST unless this tab still owns the attempt AND `submitting` is saved,
  // checked in the same tick as the POST (after Turnstile), never before.
  await steps.relay(tx, wallet, () => runDispatchGuard(() => steps.beforeSubmit({ expiresAtLedger: expiration })));
}
