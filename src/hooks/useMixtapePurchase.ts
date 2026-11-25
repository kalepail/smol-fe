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
import { getSignatureExpiration } from '../utils/rpcTip';
import { getConnectedAccount } from '../utils/wallet';
import { e2eSeams } from '../utils/collectSeams';

export interface BuyBatchTrack {
  id: string;
  sac: string;
  pool: string;
}

export async function submitBuyBatch(params: {
  tracks: BuyBatchTrack[];
  userContractId: string;
  userKeyId: string;
  /**
   * Pre-relay guard, called after the passkey returns and BEFORE relaying. It
   * must prove this attempt still owns the step and durably record
   * `submitting`; if it throws, the signed payload is discarded, never sent.
   */
  onBeforeSubmit: (info: { expiresAtLedger: number }) => void | Promise<void>;
}): Promise<void> {
  const { tracks, userContractId, userKeyId, onBeforeSubmit } = params;
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

  // simulateTransaction here is for assembly/auth/footprint only.
  const assemble = () =>
    smolClient.swap_them_in({
      user: userContractId,
      comet_addresses: tracks.map((t) => t.pool),
      tokens_out: tracks.map((t) => t.sac),
      token_amount_in: BUY_COST_STROOPS,
      fee_recipients: undefined,
    });
  const tx = (seam?.assemble ? await seam.assemble() : await assemble()) as Awaited<ReturnType<typeof assemble>>;

  const expiration = seam?.expiration ? await seam.expiration() : await getSignatureExpiration();
  if (seam?.sign) await seam.sign();
  else await signWithPasskey(tx, { keyId: userKeyId, expiration });

  // No relay unless this tab still owns the attempt AND `submitting` is saved.
  await onBeforeSubmit({ expiresAtLedger: expiration });

  if (seam?.relay) {
    await seam.relay(tracks.map((t) => t.id));
    return;
  }
  const { send } = await getConnectedAccount();
  await send(tx);
}
