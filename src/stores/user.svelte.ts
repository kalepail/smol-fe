import { getWebAuthnRpId } from '../utils/rpId';
import { logger } from '../utils/logger';

export const userState = $state<{
  contractId: string | null;
  keyId: string | null;
  walletConnected: boolean;
}>({
  contractId: null,
  keyId: null,
  walletConnected: false,
});

export function isAuthenticated(): boolean {
  return userState.contractId !== null && userState.keyId !== null;
}

export function setContractId(id: string | null) {
  userState.contractId = id;
}

export function setKeyId(id: string | null) {
  userState.keyId = id;
}

export function setUserAuth(contractId: string | null, keyId: string | null) {
  userState.contractId = contractId;
  userState.keyId = keyId;
}

export function clearUserAuth() {
  userState.contractId = null;
  userState.keyId = null;
  userState.walletConnected = false;
}

export async function ensureWalletConnected(): Promise<void> {
  if (userState.contractId && userState.keyId && !userState.walletConnected) {
    try {
      const { account } = await import('../utils/passkey-kit');
      await account.connectWallet({
        rpId: getWebAuthnRpId(),
        keyId: userState.keyId,
      });
      userState.walletConnected = true;
      logger.info('auth', 'Wallet connected successfully');
    } catch (error) {
      logger.error('auth', 'Failed to connect wallet:', error);
      throw error;
    }
  }
}

export function getContractId(): string | null {
  return userState.contractId;
}

export function getKeyId(): string | null {
  return userState.keyId;
}
