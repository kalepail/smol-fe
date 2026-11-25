/**
 * Mixtape buy helper — LAZY-LOADED (smol-sdk, passkey-kit, Stellar SDK).
 *
 * `submitBuyBatch` builds ONE `swap_them_in` for ≤9 minted songs, signs it with
 * ONE passkey prompt (explicit expiry, zero getLatestLedger) and relays it.
 * `swap_them_in` spends exactly `token_amount_in` (33 KALE) per song.
 * Buys never wait on mints (C-05): the two sets never overlap.
 *
 * Slippage: `swap_them_in` has no min-out argument, so the aggregate quote is
 * taken at approval and re-taken immediately before the passkey prompt — AFTER
 * the wallet is restored (see `batchBuyFlow.ts`); a move of more than 2%
 * against the buyer aborts with `QuoteMovedError` before anything is signed
 * (nothing can be relayed or charged).
 */
import '../utils/bufferGlobal';
import { Client as SmolClient } from 'smol-sdk';
import { quoteBuyBatch } from '../utils/cometPool';
import { BUY_COST_STROOPS } from '../utils/mixtapePricing';
import { runGuardedBatchBuy } from '../utils/batchBuyFlow';
import { signWithPasskey } from '../utils/passkeySign';
import { getSignatureExpiration } from '../utils/rpcTip';
import {
  assertWalletAction,
  assertWalletActionUnsent,
  getConnectedAccount,
  walletDispatchGuard,
  type ConnectedWallet,
  type WalletActionTicket,
} from '../utils/wallet';
import { e2eSeams } from '../utils/collectSeams';

export interface BuyBatchTrack {
  id: string;
  sac: string;
  pool: string;
}

export async function submitBuyBatch(params: {
  tracks: BuyBatchTrack[];
  /**
   * The session the user approved under (captured at click). The batch is
   * assembled for, signed by and relayed from exactly this wallet; if the
   * session changes first, it aborts (`WalletActionSupersededError`) before
   * building, prompting or relaying.
   */
  session: WalletActionTicket;
  /**
   * Pre-dispatch guard, SYNCHRONOUS. Called after the passkey returns AND after
   * Turnstile, immediately before the relayer POST (same tick). It must prove
   * this attempt still owns the step and durably record `submitting`; if it
   * throws, the signed payload is discarded, never sent.
   */
  onBeforeSubmit: (info: { expiresAtLedger: number }) => void;
}): Promise<void> {
  const { tracks, session, onBeforeSubmit } = params;
  const seam = e2eSeams()?.buy;
  const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
  if (!smolContractId) throw new Error('Buying is not configured');
  if (tracks.length === 0) return;
  const unique = new Set(tracks.map((t) => `${t.pool}:${t.sac}`));
  if (unique.size !== tracks.length) throw new Error('Duplicate songs in one buy batch');

  const smolClient = new SmolClient({
    contractId: smolContractId,
    rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
  });

  type Tx = Awaited<ReturnType<typeof smolClient.swap_them_in>>;
  await runGuardedBatchBuy<Tx, ConnectedWallet | null>({
    quote: (phase) =>
      seam?.quote ? seam.quote(phase) : quoteBuyBatch(tracks, BUY_COST_STROOPS).catch(() => null),
    // simulateTransaction here is for assembly/auth/footprint only.
    assemble: async () => {
      assertWalletAction(session); // before building
      return (seam?.assemble
        ? await seam.assemble()
        : await smolClient.swap_them_in({
            user: session.contractId,
            comet_addresses: tracks.map((t) => t.pool),
            tokens_out: tracks.map((t) => t.sac),
            token_amount_in: BUY_COST_STROOPS,
            fee_recipients: undefined,
          })) as Tx;
    },
    expiration: () => (seam?.expiration ? seam.expiration() : getSignatureExpiration()),
    // Restored BEFORE the final re-quote, then reused for signing + relay.
    // (E2E: `prepareWallet` stands in for the restore; with sign + relay seams
    // the real wallet is never needed.)
    prepareWallet: async () => {
      if (seam?.prepareWallet) {
        await seam.prepareWallet();
        assertWalletAction(session);
        return null;
      }
      if (seam?.sign && seam?.relay) return null;
      return getConnectedAccount(session);
    },
    sign: async (tx, wallet, expiration) => {
      assertWalletAction(session); // before the passkey prompt
      if (seam?.sign) return seam.sign();
      if (!wallet) throw new Error('Wallet not connected');
      await signWithPasskey(tx, { keyId: session.keyId, expiration, wallet, session });
    },
    // The store's synchronous ownership guard; it records `submitting`.
    beforeSubmit: onBeforeSubmit,
    relay: async (tx, wallet, persistSubmitting) => {
      // Final guard, run in the same tick as the POST: still the approver's
      // session → ownership + `submitting` → still the approver's session.
      const beforeDispatch = walletDispatchGuard(session, persistSubmitting);
      if (seam?.relay) {
        beforeDispatch();
        await seam.relay(tracks.map((t) => t.id));
        return;
      }
      if (!wallet) throw new Error('Wallet not connected');
      assertWalletActionUnsent(session); // early: no Turnstile for a superseded buy
      await wallet.send(tx, { beforeDispatch });
    },
  });
}
