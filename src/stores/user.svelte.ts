/**
 * User authentication state using Svelte 5 runes
 */

import { account } from '../utils/passkey-kit';
import { getDomain } from 'tldts';

export const userState = $state<{
  contractId: string | null;
  keyId: string | null;
  walletConnected: boolean;
}>({
  contractId: null,
  keyId: null,
  walletConnected: false,
});

// Derived state function
export function isAuthenticated(): boolean {
  return userState.contractId !== null && userState.keyId !== null;
}

/**
 * Set contract ID
 */
export function setContractId(id: string | null) {
  userState.contractId = id;
}

/**
 * Set key ID
 */
export function setKeyId(id: string | null) {
  userState.keyId = id;
}

/**
 * Set both contract and key ID
 */
export function setUserAuth(contractId: string | null, keyId: string | null) {
  userState.contractId = contractId;
  userState.keyId = keyId;
}

/**
 * Clear authentication
 */
export function clearUserAuth() {
  userState.contractId = null;
  userState.keyId = null;
  userState.walletConnected = false;
}

/**
 * Ensure the passkey account wallet is connected
 * This should be called once during app initialization when user is authenticated
 */
export async function ensureWalletConnected(): Promise<void> {
  // Only connect if we have auth credentials and haven't connected yet
  if (userState.contractId && userState.keyId && !userState.walletConnected) {


    try {
      const rpId = getDomain(window.location.hostname) || window.location.hostname;
      await account.connectWallet({
        rpId,
        keyId: userState.keyId,
      });
      userState.walletConnected = true;

    } catch (error) {
      console.error('[userState] Failed to connect wallet:', error);
      throw error;
    }
  }
}

/**
 * Get contract ID (read-only accessor)
 */
export function getContractId(): string | null {
  return userState.contractId;
}

/**
 * Get key ID (read-only accessor)
 */
export function getKeyId(): string | null {
  return userState.keyId;
}
