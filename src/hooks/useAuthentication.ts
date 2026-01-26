/**
 * FACTORY FRESH: Unified Authentication Hook
 * @see https://deepwiki.com/repo/kalepail/smol-fe#authentication
 * 
 * Handles PasskeyKit wallet creation and login, synchronized with
 * the smol-workflow backend. Uses the centralized "send" helper
 * for all wallet deployment transactions.
 */
import Cookies from 'js-cookie';
import { getDomain } from 'tldts';
import { account, send } from '../utils/passkey-kit';
import { getSafeRpId } from '../utils/domains';
import { setUserAuth, clearUserAuth, userState } from '../stores/user.svelte.ts';
import logger, { LogCategory } from '../utils/debug-logger';

export function useAuthentication() {
  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

  async function login() {
    console.log('[Auth] Login attempt...');

    // Clear any stale credentials before logging in
    clearUserAuth();

    try {
      const rpId = getSafeRpId(window.location.hostname);
      const result = await account.get().connectWallet({
        rpId,
      });

      console.log('[Auth] connectWallet succeeded:', { contractId: result.contractId });

      const {
        rawResponse,
        keyIdBase64,
        contractId: cid,
      } = result;

      await performLogin(cid, keyIdBase64, rawResponse, 'connect');
    } catch (err: any) {
      console.error("[Auth] Login failed:", err);
      throw err;
    }
  }

  async function performLogin(cid: string, keyIdBase64: string, rawResponse: any, type: 'connect' | 'create', username?: string) {
    const payload = {
      type,
      keyId: keyIdBase64,
      contractId: cid,
      response: rawResponse,
      username,
    };

    logger.info(LogCategory.AUTH, "Login Payload", payload);

    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMsg = text;
      try {
        const json = JSON.parse(text);
        errorMsg = json.error || json.message || text;
      } catch (e) { }
      throw new Error(`Login failed: ${errorMsg}`);
    }

    const jwt = await res.text();

    setUserAuth(cid, keyIdBase64);
    userState.walletConnected = true;

    const domain = getDomain(window.location.hostname);
    const cookieOptions: Cookies.CookieAttributes = {
      path: '/',
      secure: window.location.protocol === 'https:',
      sameSite: 'Lax',
      expires: 30,
    };
    if (domain) {
      cookieOptions.domain = `.${domain}`;
    }

    Cookies.set('smol_token', jwt, cookieOptions);
  }

  async function signUp(username: string, turnstileToken: string) {
    console.log('[Auth] Creating wallet for username:', username);

    // Clear any stale credentials
    clearUserAuth();

    try {
      const rpId = getSafeRpId(window.location.hostname);
      const result = await account.get().createWallet('smol.xyz', `SMOL — ${username}`, {
        rpId,
      });

      console.log('[Auth] Wallet created, contract ID:', result.contractId);

      const {
        rawResponse,
        keyIdBase64,
        contractId: cid,
        signedTx,
      } = result;

      // 1. Perform API login to get session token
      await performLogin(cid, keyIdBase64, rawResponse, 'create', username);

      // 2. Submit deployment transaction via proxy relayer
      console.log('[Auth] Submitting wallet deployment transaction...');
      await send(signedTx, turnstileToken);

    } catch (err: any) {
      console.error("[Auth] SignUp failed:", err);
      throw err;
    }
  }

  async function logout() {
    clearUserAuth();

    const domain = getDomain(window.location.hostname);
    const cookieOptions: Cookies.CookieAttributes = {
      path: '/',
      secure: true,
      sameSite: 'Lax',
    };
    if (domain) {
      cookieOptions.domain = `.${domain}`;
    }

    Cookies.remove('smol_token', cookieOptions);

    // Clear all smol: related data
    Object.keys(localStorage).forEach((key) => {
      if (key.includes('smol:')) {
        localStorage.removeItem(key);
      }
    });

    Object.keys(sessionStorage).forEach((key) => {
      if (key.includes('smol:')) {
        sessionStorage.removeItem(key);
      }
    });

    await fetch(`${API_URL}/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    location.reload();
  }

  return {
    login,
    signUp,
    logout,
  };
}
