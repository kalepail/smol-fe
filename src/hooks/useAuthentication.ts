import { navigate } from 'astro:transitions/client';
import { setUserAuth, clearUserAuth, readLiveSessionCookie } from '../stores/user.svelte';
import { resetBalance } from '../stores/balance.svelte';
import {
  createAccountSession,
  notifyAuthTransition,
  observeAuthTransitions,
  submitLogin,
  submitLogout,
} from '../services/api/auth';
import { e2eAuthSeams } from '../utils/authSeams';
import { getWebAuthnRpId } from '../utils/rpId';
import { clearSessionCookies, setSessionCookie } from '../utils/sessionCookie';
import { beginWalletAuthTransition, completeInteractiveWallet, signOutWallet } from '../utils/wallet';
import { AuthGeneration, type LoginOutcome } from '../utils/authTransition';

/**
 * ONE per tab (shared by every `useAuthentication()` caller): a newer login,
 * signup or logout makes every older in-flight one stale, so a passkey prompt
 * resolving late never overwrites the session or navigates.
 */
const auth = new AuthGeneration();

/** A hung POST /logout must not hold back the next login for long (an aborted response is discarded). */
const LOGOUT_TIMEOUT_MS = 10_000;
const fetchWithLogoutTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS) });

/** Drop per-user client state (`smol:*` keys) so the next account starts clean. */
function clearPrivateState() {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      const store = storage();
      Object.keys(store).forEach((key) => {
        if (key.includes('smol:')) store.removeItem(key);
      });
    } catch {
      // Ignore storage access/security errors.
    }
  }
}

export function useAuthentication() {
  /**
   * Interactive passkey login. Resolves `{ committed: false }` when a newer
   * login / signup or a logout started meanwhile: no POST /login is sent if
   * that happened during the passkey prompt, and nothing is committed if it
   * happened while the POST was in flight.
   */
  async function login(): Promise<LoginOutcome> {
    const seam = e2eAuthSeams();
    const rpId = getWebAuthnRpId();
    const ticket = auth.begin();
    // New wallet epoch: an on-demand restore still in flight for the previous
    // session can never bind (or be returned) once this connects.
    const walletTicket = beginWalletAuthTransition();
    const passkeyKit = seam?.connectWallet ? null : await import('../utils/passkey-kit');
    const { rawResponse, keyIdBase64, contractId } = passkeyKit
      ? await passkeyKit.account.connectWallet({ rpId })
      : await seam!.connectWallet!({ rpId });

    // A POST /logout this tab just sent deletes the cookie when it lands: let
    // it land before this login's cookie is set.
    await auth.logoutSettled();
    if (!auth.isCurrent(ticket)) return { committed: false };

    const jwt = await submitLogin(import.meta.env.PUBLIC_API_URL, {
      type: 'connect',
      keyId: keyIdBase64,
      contractId,
      response: rawResponse,
    });

    if (!auth.isCurrent(ticket)) {
      // Overtaken mid-POST: its Set-Cookie replaced the session cookie, so put
      // back the session this tab has since committed (none after a logout).
      const newer = auth.committed;
      if (newer === null) clearSessionCookies();
      else if (newer) setSessionCookie(newer);
      return { committed: false };
    }

    auth.commit(jwt);
    setSessionCookie(jwt);
    setUserAuth(contractId, keyIdBase64);
    // Bind the singleton to THIS login's wallet (verified); if a stale restore
    // overwrote it meanwhile, the next getConnectedAccount() re-connects it.
    if (passkeyKit) completeInteractiveWallet(passkeyKit, walletTicket, contractId, keyIdBase64);
    notifyAuthTransition();
    return { committed: true };
  }

  async function signUp(username: string): Promise<LoginOutcome> {
    const initialCookieToken = readLiveSessionCookie().rawToken;
    const transitionObserver = observeAuthTransitions();
    try {
      const seam = e2eAuthSeams();
      const rpId = getWebAuthnRpId();
      const ticket = auth.begin();
      const walletTicket = beginWalletAuthTransition();
      const passkeyKit = seam?.createWallet && seam?.send ? null : await import('../utils/passkey-kit');
      const { rawResponse, keyIdBase64, contractId, signedTx } = seam?.createWallet
        ? await seam.createWallet('smol.xyz', `SMOL — ${username}`, { rpId })
        : await passkeyKit!.account.createWallet('smol.xyz', `SMOL — ${username}`, { rpId });

      const { committed } = await createAccountSession({
        apiUrl: import.meta.env.PUBLIC_API_URL,
        payload: { type: 'create', keyId: keyIdBase64, contractId, response: rawResponse, username },
        deployWallet: () => (seam?.send ? seam.send(signedTx) : passkeyKit!.send(signedTx)),
        initialCookieToken,
        readLiveCookieToken: () => readLiveSessionCookie().rawToken,
        // A newer transition in this tab, or one from another tab / sibling
        // origin, owns the session: keep it.
        hasCompetingAuthEvent: () => !auth.isCurrent(ticket) || transitionObserver.hasCompetingTransition(),
        commitSession: (jwt) => {
          transitionObserver.close();
          auth.commit(jwt);
          setSessionCookie(jwt);
          setUserAuth(contractId, keyIdBase64);
          if (passkeyKit && !seam?.createWallet) {
            completeInteractiveWallet(passkeyKit, walletTicket, contractId, keyIdBase64);
          }
          notifyAuthTransition();
        },
      });

      return { committed };
    } finally {
      transitionObserver.close();
    }
  }

  /**
   * Explicit logout: every in-flight login / signup becomes stale, local state
   * and the client cookie clear synchronously, other tabs are notified, then
   * POST /logout clears the server cookie. The redirect home is skipped if a
   * newer login started meanwhile.
   */
  async function logout() {
    const { ticket, done } = auth.signOut(() => submitLogout(import.meta.env.PUBLIC_API_URL, fetchWithLogoutTimeout));
    // Drop the singleton's signer FIRST: nothing resolving after this can sign
    // for the signed-out account.
    signOutWallet();
    clearUserAuth();
    resetBalance();
    clearSessionCookies();
    notifyAuthTransition();
    clearPrivateState();

    await done;
    if (auth.isCurrent(ticket)) await navigate('/');
  }

  return {
    login,
    signUp,
    logout,
  };
}
