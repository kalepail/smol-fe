/**
 * FACTORY FRESH: Unified Auth State
 * @see https://deepwiki.com/repo/kalepail/smol-fe#auth-architecture
 * 
 * Standardizes wallet state using Svelte 5 runes.
 * Prioritizes PasskeyKit's local reconnection over server-side session cookies.
 */

import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from "../utils/storage";

// Initialize from localStorage if available (client-side only)
const storedContractId = safeLocalStorageGet("smol:contractId");
const storedKeyId = safeLocalStorageGet("smol:keyId");

export const userState = $state<{
  contractId: string | null;
  keyId: string | null;
  walletConnected: boolean;
}>({
  contractId: storedContractId,
  keyId: storedKeyId,
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
  if (id) safeLocalStorageSet("smol:contractId", id);
  else safeLocalStorageRemove("smol:contractId");
}

/**
 * Set key ID
 */
export function setKeyId(id: string | null) {
  userState.keyId = id;
  if (id) safeLocalStorageSet("smol:keyId", id);
  else safeLocalStorageRemove("smol:keyId");
}

/**
 * Set both contract and key ID
 */
export function setUserAuth(contractId: string | null, keyId: string | null) {
  userState.contractId = contractId;
  userState.keyId = keyId;

  if (contractId) safeLocalStorageSet("smol:contractId", contractId);
  if (keyId) safeLocalStorageSet("smol:keyId", keyId);
}

/**
 * Clear authentication
 * Now properly clears localStorage to prevent stale credentials from blocking re-login
 */
export function clearUserAuth() {
  userState.contractId = null;
  userState.keyId = null;
  userState.walletConnected = false;

  // Hard logout: Remove credentials to prevent stale passkey issues
  safeLocalStorageRemove("smol:contractId");
  safeLocalStorageRemove("smol:keyId");
  safeLocalStorageRemove("smol:skip_intro"); // Optional: reset intro

  // Reset PasskeyKit singleton so next login starts fresh
  resetPasskeyKit();
}

import { account, resetPasskeyKit } from "../utils/passkey-kit";
import { getSafeRpId } from "../utils/domains";

// ... existing code ...

/**
 * FACTORY FRESH: Passkey Reconnection
 * @see https://deepwiki.com/repo/kalepail/smol-fe#silent-reconnect
 * 
 * Invokes PasskeyKit's connectWallet safely on page load.
 * This is the canonical "silent reconnection" pattern for smol-fe.
 */
export async function ensureWalletConnected(): Promise<void> {
  const contractId = userState.contractId;
  const keyId = userState.keyId;

  if (contractId && keyId && !userState.walletConnected) {
    try {
      const rpId = getSafeRpId(window.location.hostname);
      const result = await account.get().connectWallet({
        rpId,
        keyId,
        getContractId: async () => contractId,
      });

      if (result && result.contractId === contractId) {
        userState.walletConnected = true;
        console.log('[userState] Wallet reconnected successfully');
      } else {
        throw new Error('Wallet connection mismatch or failed');
      }
    } catch (error) {
      console.error('[userState] Failed to reconnect wallet:', error);
      // Optional: don't clear auth here unless we're sure it's dead, 
      // but if the passkey itself is gone, clearUserAuth() might be safer.
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
