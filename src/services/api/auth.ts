import { getAuthCookieDomain } from '../../utils/rpId.ts';
import { readRawCookie } from '../../utils/sessionToken.ts';
import { AUTH_TRANSITION_CHANNEL, AUTH_TRANSITION_STORAGE_KEY, getSafeBroadcastChannelCtor } from './authEvents.ts';

export { AUTH_TRANSITION_CHANNEL, AUTH_TRANSITION_STORAGE_KEY, subscribeAuthTransitions } from './authEvents.ts';

export interface ConnectLoginPayload {
  type: 'connect';
  keyId: string;
  contractId: string;
  response: unknown;
}

export interface CreateLoginPayload {
  type: 'create';
  keyId: string;
  contractId: string;
  response: unknown;
  username: string;
}

export type LoginPayload = ConnectLoginPayload | CreateLoginPayload;

/**
 * Submit POST /login:
 * - `type: 'connect'` uses `credentials: 'include'` (already-deployed wallet,
 *   atomic) so cross-subdomain `Set-Cookie` on `.smol.xyz` persists.
 * - `type: 'create'` uses `credentials: 'omit'` to prevent an unfinished signup
 *   from installing a 30-day `.smol.xyz` cookie before Turnstile and wallet
 *   relay (`send(signedTx)`) succeed; revisit only when server defers cookie
 *   issuance / Phase 5 post-deploy auth ships alongside `httpOnly`.
 */
export async function submitLogin(
  apiUrl: string,
  payload: LoginPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(`${apiUrl}/login`, {
    method: 'POST',
    credentials: payload.type === 'connect' ? 'include' : 'omit',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return response.text();
  }

  const fallback =
    payload.type === 'create' ? 'Account creation failed.' : 'Sign in failed.';
  throw new Error((await response.text()) || fallback);
}

/**
 * Submit POST /logout with credentials included to clear the server-issued
 * smol_token cookie on explicit user-initiated logout.
 */
export async function submitLogout(apiUrl: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`${apiUrl}/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export const AUTH_EPOCH_COOKIE_NAME = 'smol_auth_epoch';
const AUTH_EPOCH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

let transitionSeq = 0;

function getSafeLocalStorage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

function getSafeDocument(): Pick<Document, 'cookie'> | null {
  try {
    return typeof document !== 'undefined' ? document : null;
  } catch {
    return null;
  }
}

/**
 * Read the non-secret session revision cookie (`smol_auth_epoch`): an opaque
 * stamp scoped like `smol_token`, moved on every explicit sign-in / sign-out,
 * so an in-flight signup sees a competing transition from any tab or sibling
 * origin even when neither cookie snapshot has a `smol_token`.
 */
export function readAuthEpochCookie(doc?: Pick<Document, 'cookie'> | null): string | null {
  const target = doc !== undefined ? doc : getSafeDocument();
  if (!target) return null;
  try {
    const read = readRawCookie(target.cookie, AUTH_EPOCH_COOKIE_NAME);
    return read.present && !read.malformedEncoding && read.value ? read.value : null;
  } catch {
    return null;
  }
}

/**
 * Format the `Set-Cookie` / `document.cookie` assignment for `smol_auth_epoch`,
 * scoped identically to `smol_token` (`.smol.xyz` on smol.xyz hosts, host-only
 * on localhost / 127.0.0.1 / pages.dev previews; `Secure` on HTTPS).
 */
export function buildAuthEpochCookieString(
  marker: string,
  hostname?: string,
  isHttps?: boolean,
): string {
  let resolvedHostname = hostname;
  let resolvedHttps = isHttps;
  if (resolvedHostname === undefined || resolvedHttps === undefined) {
    try {
      if (typeof window !== 'undefined' && window.location) {
        if (resolvedHostname === undefined) resolvedHostname = window.location.hostname;
        if (resolvedHttps === undefined) resolvedHttps = window.location.protocol === 'https:';
      }
    } catch {
      // Ignore window.location access errors.
    }
  }

  const domain = getAuthCookieDomain(resolvedHostname ?? '');
  const parts = [
    `${AUTH_EPOCH_COOKIE_NAME}=${encodeURIComponent(marker)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${AUTH_EPOCH_MAX_AGE_SECONDS}`,
  ];
  if (domain) {
    parts.push(`Domain=${domain}`);
  }
  if (resolvedHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Read the non-secret cross-tab auth transition marker from localStorage.
 * Stores no credentials or tokens — only an opaque monotonic/random stamp
 * written on explicit sign-in or sign-out so an in-flight signup can detect
 * a competing sign-in or sign-out even when both cookie snapshots are empty.
 */
export function readAuthTransitionMarker(
  storage?: Pick<Storage, 'getItem'> | null,
): string | null {
  const target = storage !== undefined ? storage : getSafeLocalStorage();
  if (!target) return null;
  try {
    return target.getItem(AUTH_TRANSITION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Announce an explicit sign-in / sign-out AFTER `smol_token` holds its new
 * value (or is gone), via:
 * 1. `smol_auth_epoch` cookie (sibling origins at the session cookie scope),
 * 2. `localStorage['smol_auth_transition']` (quota- and SecurityError-safe),
 * 3. `BroadcastChannel('smol-auth-transitions')` (works even when storage is denied/full).
 * Other tabs then re-read the session cookie (`subscribeAuthTransitions`).
 */
export function notifyAuthTransition(options?: {
  storage?: Pick<Storage, 'setItem'> | null;
  BroadcastChannelCtor?: typeof BroadcastChannel | null;
  document?: Pick<Document, 'cookie'> | null;
  hostname?: string;
  isHttps?: boolean;
}): string {
  transitionSeq += 1;
  const marker = `${Date.now()}-${transitionSeq}-${Math.random().toString(36).slice(2, 8)}`;

  const doc = options?.document !== undefined ? options.document : getSafeDocument();
  if (doc) {
    try {
      doc.cookie = buildAuthEpochCookieString(marker, options?.hostname, options?.isHttps);
    } catch {
      // Ignore cookie write errors.
    }
  }

  const storage = options?.storage !== undefined ? options.storage : getSafeLocalStorage();
  if (storage) {
    try {
      storage.setItem(AUTH_TRANSITION_STORAGE_KEY, marker);
    } catch {
      // Ignore quota or storage errors; cookie + BroadcastChannel still notify open tabs.
    }
  }

  const ChannelCtor =
    options?.BroadcastChannelCtor !== undefined ? options.BroadcastChannelCtor : getSafeBroadcastChannelCtor();
  if (ChannelCtor) {
    try {
      const channel = new ChannelCtor(AUTH_TRANSITION_CHANNEL);
      channel.postMessage({ type: 'auth-transition' });
      channel.close();
    } catch {
      // Ignore BroadcastChannel errors.
    }
  }

  return marker;
}

export interface AuthTransitionObserver {
  startMarker: string | null;
  startAuthEpoch: string | null;
  hasCompetingTransition: () => boolean;
  close: () => void;
}

/**
 * Snapshot the current auth-transition marker + cross-origin `smol_auth_epoch`
 * cookie and subscribe to BroadcastChannel before an interactive passkey prompt
 * starts so any competing sign-in or explicit sign-out across tabs or sibling
 * origins is observable even under storage quota or SecurityError.
 */
export function observeAuthTransitions(options?: {
  storage?: Pick<Storage, 'getItem'> | null;
  BroadcastChannelCtor?: typeof BroadcastChannel | null;
  document?: Pick<Document, 'cookie'> | null;
}): AuthTransitionObserver {
  const startMarker = readAuthTransitionMarker(options?.storage);
  const startAuthEpoch = readAuthEpochCookie(options?.document);
  let sawChannelEvent = false;
  let channel: BroadcastChannel | null = null;

  const ChannelCtor =
    options?.BroadcastChannelCtor !== undefined
      ? options.BroadcastChannelCtor
      : getSafeBroadcastChannelCtor();
  if (ChannelCtor) {
    try {
      channel = new ChannelCtor(AUTH_TRANSITION_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event?.data?.type === 'auth-transition') {
          sawChannelEvent = true;
        }
      };
    } catch {
      channel = null;
    }
  }

  return {
    startMarker,
    startAuthEpoch,
    hasCompetingTransition: () =>
      sawChannelEvent ||
      readAuthTransitionMarker(options?.storage) !== startMarker ||
      readAuthEpochCookie(options?.document) !== startAuthEpoch,
    close: () => {
      try {
        channel?.close();
      } catch {
        // Ignore close errors.
      }
      channel = null;
    },
  };
}

export interface CreateAccountSessionResult {
  jwt: string;
  committed: boolean;
}

/**
 * Run signup login (`credentials: 'omit'`, preserving the API's undeployed-wallet
 * precondition without installing a provisional cookie) followed by wallet
 * deployment. Only after `deployWallet()` succeeds does it commit the session —
 * and if another tab signed in or explicitly signed out while the passkey prompt
 * or deployment was in flight, it preserves that tab's state and returns
 * `{ committed: false }`.
 */
export async function createAccountSession(params: {
  apiUrl: string;
  payload: CreateLoginPayload;
  deployWallet: () => Promise<unknown>;
  initialCookieToken?: string | null;
  readLiveCookieToken: () => string | null;
  hasCompetingAuthEvent?: () => boolean;
  commitSession: (jwt: string) => void;
  fetchImpl?: typeof fetch;
}): Promise<CreateAccountSessionResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const initialCookieToken =
    params.initialCookieToken !== undefined
      ? params.initialCookieToken
      : params.readLiveCookieToken();

  const jwt = await submitLogin(params.apiUrl, params.payload, fetchImpl);
  await params.deployWallet();

  const liveCookieNow = params.readLiveCookieToken();
  if (liveCookieNow !== initialCookieToken || params.hasCompetingAuthEvent?.()) {
    return { jwt, committed: false };
  }

  params.commitSession(jwt);
  return { jwt, committed: true };
}
