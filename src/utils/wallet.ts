import { userState } from '../stores/user.svelte';
import { getWebAuthnRpId } from './rpId';
import { logger } from './logger';

/**
 * Lazy-load passkey-kit and ensure the passkey wallet is connected before signing.
 * Non-wallet routes never pull passkey-kit or @stellar/stellar-sdk.
 */
export async function getConnectedAccount() {
  const mod = await import('./passkey-kit');

  if (userState.contractId && userState.keyId && !userState.walletConnected) {
    try {
      await mod.account.connectWallet({
        rpId: getWebAuthnRpId(),
        keyId: userState.keyId,
      });
      userState.walletConnected = true;
      logger.info('auth', 'Wallet connected on demand');
    } catch (error) {
      logger.error('auth', 'Failed to connect wallet:', error);
      throw error;
    }
  }

  return mod;
}
