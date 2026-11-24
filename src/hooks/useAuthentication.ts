import Cookies from 'js-cookie';
import { navigate } from 'astro:transitions/client';
import {
  setUserAuth,
  clearUserAuth,
  readLiveSessionCookie,
  userState,
} from '../stores/user.svelte';
import { resetBalance } from '../stores/balance.svelte';
import {
  createAccountSession,
  notifyAuthTransition,
  observeAuthTransitions,
  submitLogin,
  submitLogout,
} from '../services/api/auth';
import { e2eAuthSeams } from '../utils/authSeams';
import { getAuthCookieDomain, getWebAuthnRpId } from '../utils/rpId';

export function useAuthentication() {
  function cookieOptions() {
    const domain = getAuthCookieDomain();
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    return {
      path: '/',
      secure: isHttps,
      sameSite: 'Lax' as const,
      ...(domain ? { domain } : {}),
    };
  }

  function setSessionCookie(jwt: string) {
    Cookies.set('smol_token', jwt, {
      ...cookieOptions(),
      expires: 30,
    });
  }

  async function login() {
    const seam = e2eAuthSeams();
    const rpId = getWebAuthnRpId();
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
    } = seam?.connectWallet
      ? await seam.connectWallet({ rpId })
      : await (await import('../utils/passkey-kit')).account.connectWallet({
          rpId,
        });

    const jwt = await submitLogin(import.meta.env.PUBLIC_API_URL, {
      type: 'connect',
      keyId: keyIdBase64,
      contractId: cid,
      response: rawResponse,
    });

    setSessionCookie(jwt);
    setUserAuth(cid, keyIdBase64);
    userState.walletConnected = true;
    notifyAuthTransition();
  }

  async function signUp(username: string): Promise<{ committed: boolean }> {
    const initialCookieToken = readLiveSessionCookie().rawToken;
    const transitionObserver = observeAuthTransitions();
    try {
      const seam = e2eAuthSeams();
      const rpId = getWebAuthnRpId();
      const passkeyKit =
        seam?.createWallet && seam?.send ? null : await import('../utils/passkey-kit');
      const {
        rawResponse,
        keyIdBase64,
        contractId: cid,
        signedTx,
      } = seam?.createWallet
        ? await seam.createWallet('smol.xyz', `SMOL — ${username}`, { rpId })
        : await passkeyKit!.account.createWallet('smol.xyz', `SMOL — ${username}`, {
            rpId,
          });

      const { committed } = await createAccountSession({
        apiUrl: import.meta.env.PUBLIC_API_URL,
        payload: {
          type: 'create',
          keyId: keyIdBase64,
          contractId: cid,
          response: rawResponse,
          username,
        },
        deployWallet: () =>
          seam?.send ? seam.send(signedTx) : passkeyKit!.send(signedTx),
        initialCookieToken,
        readLiveCookieToken: () => readLiveSessionCookie().rawToken,
        hasCompetingAuthEvent: () => transitionObserver.hasCompetingTransition(),
        commitSession: (jwt) => {
          transitionObserver.close();
          setSessionCookie(jwt);
          setUserAuth(cid, keyIdBase64);
          userState.walletConnected = true;
          notifyAuthTransition();
        },
      });

      return { committed };
    } finally {
      transitionObserver.close();
    }
  }

  async function logout() {
    clearUserAuth();
    resetBalance();

    Cookies.remove('smol_token', cookieOptions());
    Cookies.remove('smol_token', { path: '/' });
    notifyAuthTransition();

    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.includes('smol:')) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore localStorage access/security errors.
    }

    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.includes('smol:')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore sessionStorage access/security errors.
    }

    try {
      await submitLogout(import.meta.env.PUBLIC_API_URL);
    } catch {
      // Cookie is already cleared client-side.
    }

    await navigate('/');
  }

  return {
    login,
    signUp,
    logout,
  };
}
