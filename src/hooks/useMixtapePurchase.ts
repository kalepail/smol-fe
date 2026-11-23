/**
 * Mixtape buy helper — LAZY-LOADED (smol-sdk, passkey-kit, Stellar SDK).
 *
 * `submitBuyBatch` builds ONE `swap_them_in` for ≤9 minted songs, signs it with
 * ONE passkey prompt (explicit expiry, zero getLatestLedger) and relays it.
 * `swap_them_in` spends exactly `token_amount_in` (33 KALE) per song.
 * Buys never wait on mints (C-05): the two sets never overlap.
 */
import { Client as SmolClient } from 'smol-sdk';
import { BUY_COST_STROOPS } from '../utils/mixtapePricing';
import { signWithPasskey } from '../utils/passkeySign';
import { getConnectedAccount } from '../utils/wallet';

export interface BuyBatchTrack {
  id: string;
  sac: string;
  pool: string;
}

export async function submitBuyBatch(params: {
  tracks: BuyBatchTrack[];
  userContractId: string;
  userKeyId: string;
  /** Fires once the passkey signature is done (UI: Approve → Sending). */
  onSigned?: () => void;
}): Promise<void> {
  const { tracks, userContractId, userKeyId, onSigned } = params;
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

  // simulateTransaction here is for assembly/auth/footprint only.
  const tx = await smolClient.swap_them_in({
    user: userContractId,
    comet_addresses: tracks.map((t) => t.pool),
    tokens_out: tracks.map((t) => t.sac),
    token_amount_in: BUY_COST_STROOPS,
    fee_recipients: undefined,
  });

  await signWithPasskey(tx, { keyId: userKeyId });
  onSigned?.();
  const { send } = await getConnectedAccount();
  await send(tx);
}
