import Cookies from 'js-cookie';
import { getDomain } from 'tldts';
import { account, send } from '../utils/passkey-kit';
import { setUserAuth, clearUserAuth, userState } from '../stores/user.svelte';

interface ConnectResult {
  rawResponse: unknown;
  keyIdBase64: string;
  contractId: string;
}

interface CreateResult extends ConnectResult {
  signedTx: string;
}

export function useAuthentication() {
  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
  async function login() {
    const rpId = getDomain(window.location.hostname) ?? undefined;
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
    } = await account.connectWallet({
      rpId,
    });

    const jwt = await fetch(`${API_URL}/login`, {
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
      throw await res.text();
    });

    setUserAuth(cid, keyIdBase64);
    // Mark wallet as connected since connectWallet was just called
    userState.walletConnected = true;

    const domain = getDomain(window.location.hostname);
    const isSecure = window.location.protocol === 'https:';
    const cookieOptions: Cookies.CookieAttributes = {
      path: '/',
      secure: isSecure,
      sameSite: 'Lax',
      expires: 30,
    };
    if (domain) {
      cookieOptions.domain = `.${domain}`;
    }

    Cookies.set('smol_token', jwt, cookieOptions);
  }

  async function signUp(username: string) {
    const rpId = getDomain(window.location.hostname) ?? undefined;
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
      signedTx,
    } = await account.createWallet('smol.xyz', `SMOL — ${username}`, {
      rpId,
    });

    const jwt = await fetch(`${API_URL}/login`, {
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
      throw await res.text();
    });

    await send(signedTx);

    setUserAuth(cid, keyIdBase64);
    // Mark wallet as connected since createWallet was just called (which internally connects)
    userState.walletConnected = true;

    const domain = getDomain(window.location.hostname);
    const isSecure = window.location.protocol === 'https:';
    const cookieOptions: Cookies.CookieAttributes = {
      path: '/',
      secure: isSecure,
      sameSite: 'Lax',
      expires: 30,
    };
    if (domain) {
      cookieOptions.domain = `.${domain}`;
    }

    Cookies.set('smol_token', jwt, cookieOptions);
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
    });

    location.reload();
  }

  return {
    login,
    signUp,
    logout,
  };
}
