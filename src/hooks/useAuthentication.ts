import Cookies from 'js-cookie';
import { navigate } from 'astro:transitions/client';
import { setUserAuth, clearUserAuth, userState } from '../stores/user.svelte';
import { resetBalance } from '../stores/balance.svelte';
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

  async function login() {
    const { account } = await import('../utils/passkey-kit');
    const rpId = getWebAuthnRpId();
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
    } = await account.connectWallet({
      rpId,
    });

    const jwt = await fetch(`${import.meta.env.PUBLIC_API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'connect',
        keyId: keyIdBase64,
        contractId: cid,
        response: rawResponse,
      }),
    }).then(async (res) => {
      if (res.ok) return res.text();
      throw new Error((await res.text()) || 'Sign in failed.');
    });

    setUserAuth(cid, keyIdBase64);
    userState.walletConnected = true;

    Cookies.set('smol_token', jwt, {
      ...cookieOptions(),
      expires: 30,
    });
  }

  async function signUp(username: string) {
    const { account, send } = await import('../utils/passkey-kit');
    const rpId = getWebAuthnRpId();
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
      signedTx,
    } = await account.createWallet('smol.xyz', `SMOL — ${username}`, {
      rpId,
    });

    const jwt = await fetch(`${import.meta.env.PUBLIC_API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'create',
        keyId: keyIdBase64,
        contractId: cid,
        response: rawResponse,
        username,
      }),
    }).then(async (res) => {
      if (res.ok) return res.text();
      throw new Error((await res.text()) || 'Account creation failed.');
    });

    await send(signedTx);

    setUserAuth(cid, keyIdBase64);
    userState.walletConnected = true;

    Cookies.set('smol_token', jwt, {
      ...cookieOptions(),
      expires: 30,
    });
  }

  async function logout() {
    clearUserAuth();
    resetBalance();

    Cookies.remove('smol_token', cookieOptions());
    Cookies.remove('smol_token', { path: '/' });

    try {
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
    } catch {
      // Ignore storage errors.
    }

    try {
      await fetch(`${import.meta.env.PUBLIC_API_URL}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
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
