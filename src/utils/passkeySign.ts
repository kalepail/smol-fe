/**
 * Passkey signing adapter — LAZY-LOADED (passkey-kit + Stellar SDK).
 *
 * passkey-kit 0.12 `account.sign()` calls the SDK's `signAuthEntries()` without
 * an expiration, and the SDK's default expression eagerly fires a second
 * multi-MB `getLatestLedger()` even when passkey-kit already has an expiry.
 * This adapter supplies one explicit expiration (from the 195-byte health tip)
 * at BOTH levels, so a signed build costs zero `getLatestLedger` calls.
 */
import './bufferGlobal';
import { xdr } from '@stellar/stellar-sdk/minimal';
import type { AssembledTransaction } from '@stellar/stellar-sdk/minimal/contract';
import { getSignatureExpiration } from './rpcTip';
import { getWebAuthnRpId } from './rpId';
import {
  assertWalletSigner,
  getConnectedAccount,
  type ConnectedWallet,
  type WalletActionTicket,
} from './wallet';

/**
 * Sign `tx`'s auth entries with the session's passkey wallet.
 *
 * Pass `wallet` (from `getConnectedAccount()`) when the caller already prepared
 * it, e.g. a batch buy that restores the wallet BEFORE its final price check:
 * signing then starts the passkey prompt immediately, with no second (slow)
 * wallet-restore window between the price check and the signature. Either way
 * the signer is re-verified against the current session right before signing.
 *
 * Pass `session` (the action's ticket, captured at submit): if the account
 * changed since, the passkey is never prompted (`WalletActionSupersededError`).
 */
export async function signWithPasskey<T>(
  tx: AssembledTransaction<T>,
  opts: { keyId: string; expiration?: number; wallet?: ConnectedWallet; session?: WalletActionTicket }
): Promise<AssembledTransaction<T>> {
  const prepared = opts.wallet ?? (await getConnectedAccount(opts.session));
  const expiration = opts.expiration ?? (await getSignatureExpiration());
  assertWalletSigner(prepared, opts.keyId, opts.session);
  const { account } = prepared;
  const wallet = account.wallet;
  if (!wallet) throw new Error('Wallet not connected');
  const options = { rpId: getWebAuthnRpId(), keyId: opts.keyId, expiration };

  await tx.signAuthEntries({
    address: wallet.options.contractId,
    expiration,
    authorizeEntry: (entry) => {
      // Each prompt: still the same session and signer (no switch mid-batch).
      assertWalletSigner(prepared, opts.keyId, opts.session);
      return account.signAuthEntry(xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR()), options);
    },
  });
  return tx;
}
