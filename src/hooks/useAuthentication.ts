import Cookies from 'js-cookie';
import { getDomain } from 'tldts';
import { getSafeRpId } from '../utils/domains';
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
    const hostname = window.location.hostname;

    try {
      const result = await account.get().connectWallet({
        rpId: getSafeRpId(hostname),
      });

      const {
        rawResponse,
        contractId: cid,
      } = result;

      // Ensure we get a string keyId (passkey-kit v0.6+ vs older)
      const keyIdBase64 = result.keyIdBase64 ||
        (typeof result.keyId === 'string' ? result.keyId : Buffer.from(result.keyId).toString('base64').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));

      await performLogin(cid, keyIdBase64, rawResponse, 'connect');
    } catch (connectErr) {
      console.error("Connect failed:", connectErr);
      throw connectErr;
    }
  }

  async function performLogin(cid: string, keyIdBase64: string, rawResponse: any, type: 'connect' | 'create', username?: string) {
    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
    const jwt = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        keyId: keyIdBase64,
        contractId: cid,
        response: rawResponse,
        username
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

  async function signUp(username: string, turnstileToken: string) {
    const hostname = window.location.hostname;

    const result = await account.get().createWallet('smol.xyz', `SMOL — ${username}`, {
      rpId: getSafeRpId(hostname),
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required"
      }
    });

    const {
      rawResponse,
      contractId: cid,
      signedTx,
    } = result;

    const keyIdBase64 = result.keyIdBase64 ||
      (typeof result.keyId === 'string' ? result.keyId : Buffer.from(result.keyId).toString('base64').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));

    await performLogin(cid, keyIdBase64, rawResponse, 'create', username);

    await send(signedTx, turnstileToken);
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
      // Preserve keyId and contractId for "Soft Logout" (Wallet Remembered)
      // This allows 'Targeted Authentication' which is required for localhost stability.
      // If the key is invalid, ensureWalletConnected will auto-burn it (see stores/user.svelte.ts).
      if (key.includes('smol:') && key !== 'smol:contractId' && key !== 'smol:keyId') {
        localStorage.removeItem(key);
      }
    });

    Object.keys(sessionStorage).forEach((key) => {
      if (key.includes('smol:') && key !== 'smol:contractId' && key !== 'smol:keyId') {
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
