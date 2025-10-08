import Cookies from 'js-cookie';
import { getDomain } from 'tldts';
import { account, server } from '../utils/passkey-kit';
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
  async function login() {
    const rpId = getDomain(window.location.hostname);
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
    } = await account.connectWallet({
      rpId: rpId !== null ? rpId : undefined,
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
      throw await res.text();
    });

    setUserAuth(cid, keyIdBase64);
    // Mark wallet as connected since connectWallet was just called
    userState.walletConnected = true;

    Cookies.set('smol_token', jwt, {
      path: '/',
      secure: true,
      sameSite: 'Lax',
      domain: '.smol.xyz',
      expires: 30,
    });
  }

  async function signUp(username: string) {
    const rpId = getDomain(window.location.hostname);
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
      signedTx,
    } = await account.createWallet('smol.xyz', `SMOL — ${username}`, {
      rpId: rpId !== null ? rpId : undefined,
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
      throw await res.text();
    });

    await server.send(signedTx);

    setUserAuth(cid, keyIdBase64);
    // Mark wallet as connected since createWallet was just called (which internally connects)
    userState.walletConnected = true;

    Cookies.set('smol_token', jwt, {
      path: '/',
      secure: true,
      sameSite: 'Lax',
      domain: '.smol.xyz',
      expires: 30,
    });
  }

  async function logout() {
    clearUserAuth();

    Cookies.remove('smol_token', {
      path: '/',
      secure: true,
      sameSite: 'Lax',
      domain: '.smol.xyz',
    });

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

    await fetch(`${import.meta.env.PUBLIC_API_URL}/logout`, {
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
