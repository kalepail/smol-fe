/**
 * Passkey signing adapter — LAZY-LOADED (passkey-kit + Stellar SDK).
 *
 * passkey-kit 0.12 `account.sign()` calls the SDK's `signAuthEntries()` without
 * an expiration, and the SDK's default expression eagerly fires a second
 * multi-MB `getLatestLedger()` even when passkey-kit already has an expiry.
 * This adapter supplies one explicit expiration (from the 195-byte health tip)
 * at BOTH levels, so a signed build costs zero `getLatestLedger` calls.
 */
import { xdr } from '@stellar/stellar-sdk/minimal';
import type { AssembledTransaction } from '@stellar/stellar-sdk/minimal/contract';
import { getSignatureExpiration } from './rpcTip';
import { getWebAuthnRpId } from './rpId';
import { getConnectedAccount } from './wallet';

export async function signWithPasskey<T>(
  tx: AssembledTransaction<T>,
  opts: { keyId: string; expiration?: number }
): Promise<AssembledTransaction<T>> {
  const { account } = await getConnectedAccount();
  const wallet = account.wallet;
  if (!wallet) throw new Error('Wallet not connected');
  const expiration = opts.expiration ?? (await getSignatureExpiration());
  const options = { rpId: getWebAuthnRpId(), keyId: opts.keyId, expiration };

  await tx.signAuthEntries({
    address: wallet.options.contractId,
    expiration,
    authorizeEntry: (entry) =>
      account.signAuthEntry(xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR()), options),
  });
  return tx;
}
