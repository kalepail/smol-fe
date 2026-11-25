import { parseSessionToken, readRawCookie } from '../utils/sessionToken';

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

/**
 * Session generation: bumped on EVERY auth identity change in this tab (login,
 * signup, logout, cross-tab switch picked up from the cookie), even a switch
 * back to the same wallet. Not reactive: it only stamps wallet action tickets.
 */
let sessionGeneration = 0;

export function getSessionGeneration(): number {
  return sessionGeneration;
}

/**
 * The identity a wallet action (transfer, swap, batch buy, mint) was started
 * for. Captured synchronously when the user submits; the action must abort if
 * the session no longer matches it before building, signing or relaying.
 */
export interface SessionTicket {
  contractId: string;
  keyId: string;
  generation: number;
}

/** The current signed-in session as a ticket, or `null` when signed out. */
export function captureSessionTicket(): SessionTicket | null {
  const { contractId, keyId } = userState;
  if (!contractId || !keyId) return null;
  return { contractId, keyId, generation: sessionGeneration };
}

export function isSessionTicketCurrent(ticket: SessionTicket): boolean {
  return (
    userState.contractId === ticket.contractId &&
    userState.keyId === ticket.keyId &&
    sessionGeneration === ticket.generation
  );
}

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

  sessionGeneration++;
  userState.contractId = next.contractId;
  userState.keyId = next.keyId;
  userState.walletConnected = false;
  return true;
}

export function isAuthenticated(): boolean {
  return userState.contractId !== null && userState.keyId !== null;
}

export function setUserAuth(contractId: string | null, keyId: string | null) {
  sessionGeneration++;
  userState.contractId = contractId;
  userState.keyId = keyId;
}

export function clearUserAuth() {
  sessionGeneration++;
  userState.contractId = null;
  userState.keyId = null;
  userState.walletConnected = false;
}
