import { getWebAuthnRpId } from '../utils/rpId';
import { parseSessionToken, readRawCookie } from '../utils/sessionToken';
import { logger } from '../utils/logger';

export interface LiveSessionIdentity {
  contractId: string | null;
  keyId: string | null;
  rawToken: string | null;
}

const EMPTY_SESSION: LiveSessionIdentity = { contractId: null, keyId: null, rawToken: null };

/**
 * Read the authoritative live client session from `document.cookie`.
 * While `smol_token` is script-readable (pre-httpOnly cutover), an absent,
 * malformed, or expired cookie ALWAYS resolves as signed out — never falling
 * back to older SSR HTML props or attributes from an in-flight navigation.
 */
export function readLiveSessionCookie(): LiveSessionIdentity {
  if (typeof document === 'undefined') return EMPTY_SESSION;
  try {
    const cookieRead = readRawCookie(document.cookie, 'smol_token');
    if (!cookieRead.present || cookieRead.malformedEncoding) return EMPTY_SESSION;
    const session = parseSessionToken(cookieRead.value);
    return session
      ? { contractId: session.contractId, keyId: session.keyId, rawToken: cookieRead.value }
      : EMPTY_SESSION;
  } catch {
    return EMPTY_SESSION;
  }
}

const initialSession = readLiveSessionCookie();

export const userState = $state<{
  contractId: string | null;
  keyId: string | null;
  walletConnected: boolean;
}>({
  contractId: initialSession.contractId,
  keyId: initialSession.keyId,
  walletConnected: false,
});

/**
 * Reconcile userState strictly against the live `document.cookie` smol_token.
 * Returns true if the active session changed or cleared.
 */
export function syncUserAuthFromCookie(): boolean {
  const next = readLiveSessionCookie();
  const changed =
    userState.contractId !== next.contractId || userState.keyId !== next.keyId;

  if (!changed) return false;

  if (!next.contractId || !next.keyId) {
    clearUserAuth();
    return true;
  }

  userState.contractId = next.contractId;
  userState.keyId = next.keyId;
  userState.walletConnected = false;
  return true;
}

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
