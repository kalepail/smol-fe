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
    const rpId = getSafeRpId(hostname);

    console.log('[Auth] Login attempt:', { hostname, rpId });

    // Clear any stale credentials before logging in
    clearUserAuth();

    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported in this browser');
      }

      console.log('[Auth] Calling connectWallet with rpId:', rpId);
      const result = await account.get().connectWallet({
        rpId: rpId,
      });

      console.log('[Auth] connectWallet succeeded:', { contractId: result.contractId });

      const {
        rawResponse,
        contractId: cid,
      } = result;

      // Ensure we get a string keyId (passkey-kit v0.6+ vs older)
      const keyIdBase64 = result.keyIdBase64 ||
        (typeof result.keyId === 'string' ? result.keyId : Buffer.from(result.keyId).toString('base64').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));

      console.log('[Auth] Performing login with contract ID:', cid);
      await performLogin(cid, keyIdBase64, rawResponse, 'connect');
    } catch (connectErr: any) {
      console.error("[Auth] Connect failed:", {
        message: connectErr.message,
        name: connectErr.name,
        code: connectErr.code,
        stack: connectErr.stack
      });

      // Enhance error message for better user feedback
      if (connectErr.name === 'NotAllowedError') {
        throw new Error('Passkey authentication was cancelled or not allowed');
      } else if (connectErr.message?.includes('No credentials available')) {
        throw new Error('No passkey found for this device');
      }

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

    // Clear any stale credentials before creating new account
    clearUserAuth();

    console.log('[Auth] Creating wallet for username:', username);

    const result = await account.get().createWallet('smol.xyz', `SMOL — ${username}`, {
      rpId: getSafeRpId(hostname),
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required"
      }
    });

    console.log('[Auth] Wallet created, contract ID:', result.contractId);

    const {
      rawResponse,
      contractId: cid,
      signedTx,
    } = result;

    const keyIdBase64 = result.keyIdBase64 ||
      (typeof result.keyId === 'string' ? result.keyId : Buffer.from(result.keyId).toString('base64').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));

    console.log('[Auth] Performing login...');
    await performLogin(cid, keyIdBase64, rawResponse, 'create', username);

    console.log('[Auth] Sending wallet deployment transaction...');

    // Wallet deployments MUST use KaleFarm's raw XDR endpoint, not OZ Channels
    // OZ Channels can't handle factory-signed transactions
    // For dev/preview without Turnstile, we'll use a dummy token (API key auth takes precedence)
    await send(signedTx, turnstileToken || 'dev-bypass');
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

    // Clear all smol: related data from localStorage and sessionStorage
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
