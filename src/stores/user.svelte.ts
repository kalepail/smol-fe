/**
 * FACTORY FRESH: Unified Auth State Actions
 * @see https://deepwiki.com/repo/kalepail/smol-fe#auth-architecture
 * 
 * Contains SDK-heavy authentication actions.
 * Use DYNAMIC IMPORTS for PasskeyKit to avoid bloating core chunks.
 */

import { safeLocalStorageRemove } from "../utils/storage";
import { userState } from "./user.state.svelte";
import { getSafeRpId } from "../utils/domains";

// Re-export state and getters for convenience
export * from "./user.state.svelte";

/**
 * Clear authentication
 */
export async function clearUserAuth() {
  userState.contractId = null;
  userState.keyId = null;
  userState.walletConnected = false;

  // Hard logout: Remove credentials to prevent stale passkey issues
  safeLocalStorageRemove("smol:contractId");
  safeLocalStorageRemove("smol:keyId");
  safeLocalStorageRemove("smol:skip_intro");

  // Reset PasskeyKit singleton dynamically
  const { resetPasskeyKit } = await import("../utils/passkey-kit");
  resetPasskeyKit();
}

/**
 * Get the PasskeyKit instance directly (for custom transactions)
 */
export async function getPasskeyKit(): Promise<any> {
  const { account } = await import("../utils/passkey-kit");
  return account.get();
}

/**
 * FACTORY FRESH: Passkey Reconnection
 * @see https://deepwiki.com/repo/kalepail/smol-fe#silent-reconnect
 * 
 * Uses dynamic import to keep Stellar SDK out of initial chunks.
 */
export async function ensureWalletConnected(): Promise<void> {
  const contractId = userState.contractId;
  const keyId = userState.keyId;

  if (contractId && keyId && !userState.walletConnected) {
    try {
      // DYNAMIC IMPORT: This keeps the heavy SDK out of the Layout chunk!
      const { account } = await import("../utils/passkey-kit");

      const rpId = getSafeRpId(window.location.hostname);

      const kit = await account.get();
      const result = await kit.connectWallet({
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
    }
  }
}

/**
 * Force a fresh Passkey authentication prompt (e.g. for ZK identity commitment).
 * Resets the internal singleton to bypass any cached session state.
 */
export async function forceReauthentication(): Promise<void> {
  const { resetPasskeyKit, account } = await import("../utils/passkey-kit");
  resetPasskeyKit(); // Nuke the singleton to force a fresh prompt

  const contractId = userState.contractId;
  const keyId = userState.keyId;
  const rpId = getSafeRpId(window.location.hostname);

  if (!contractId || !keyId) throw new Error("Cannot re-authenticate: Missing auth state");

  console.log('[userState] Forcing re-authentication via PasskeyKit...');

  const kit = await account.get(); // Gets a FRESH instance
  await kit.connectWallet({
    rpId,
    keyId,
    getContractId: async () => contractId,
  });

  console.log('[userState] Re-authentication (Identity Commitment) complete');
}
