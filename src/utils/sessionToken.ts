import { getAuthCookieDomain } from './rpId.ts';

export interface ParsedSessionToken {
  contractId: string;
  keyId: string;
  exp: number;
}

export interface SessionCookieDeleteOptions {
  path: '/';
  domain?: '.smol.xyz';
}

export interface SessionCookieResolution {
  cid: string | null;
  kid: string | null;
  shouldDeleteCookie: boolean;
  shouldSetNoStore: boolean;
  deleteCookieOptions: SessionCookieDeleteOptions;
}

export type CookieReadResult =
  | { present: false; value: undefined; malformedEncoding: false }
  | { present: true; value: string; malformedEncoding: false }
  | { present: true; value: undefined; malformedEncoding: true };

export interface SafeCookieSource {
  request?: { headers: { get(name: string): string | null } };
  cookies?: {
    has?(name: string): boolean;
    get(
      name: string,
      options?: { decode?: (value: string) => string },
    ): { value: string } | undefined;
  };
}

/**
 * Exception-safe cookie reader for a raw HTTP Cookie header or document.cookie.
 * Preserves the distinction between absent, present-and-decoded, and
 * present-with-invalid-percent-encoding (which Astro 5.14.1's cookies.get()
 * otherwise throws a URIError on).
 */
export function readRawCookie(
  cookieHeader: string | null | undefined,
  name: string,
): CookieReadResult {
  if (!cookieHeader) {
    return { present: false, value: undefined, malformedEncoding: false };
  }

  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;

    let rawValue = trimmed.slice(prefix.length);
    if (rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')) {
      rawValue = rawValue.slice(1, -1);
    }

    try {
      return {
        present: true,
        value: decodeURIComponent(rawValue),
        malformedEncoding: false,
      };
    } catch {
      return {
        present: true,
        value: undefined,
        malformedEncoding: true,
      };
    }
  }

  return { present: false, value: undefined, malformedEncoding: false };
}

/**
 * Shared exception-safe reader for `smol_token` in Astro SSR (Layout.astro and
 * serverApiFetch). Prefers the raw `Cookie` request header so AstroCookies.get()
 * never throws URIError on malformed percent-encoding, with a safe fallback for
 * mock contexts that only supply `cookies`.
 */
export function readSessionCookieFromRequest(source: SafeCookieSource): CookieReadResult {
  if (source.request) {
    return readRawCookie(source.request.headers.get('cookie'), 'smol_token');
  }
  if (!source.cookies) {
    return { present: false, value: undefined, malformedEncoding: false };
  }

  const hasCookie =
    typeof source.cookies.has === 'function' ? source.cookies.has('smol_token') : undefined;
  try {
    const raw = source.cookies.get('smol_token', { decode: (v) => v });
    if (raw === undefined) {
      return hasCookie
        ? { present: true, value: '', malformedEncoding: false }
        : { present: false, value: undefined, malformedEncoding: false };
    }
    try {
      return {
        present: true,
        value: decodeURIComponent(raw.value),
        malformedEncoding: false,
      };
    } catch {
      return { present: true, value: undefined, malformedEncoding: true };
    }
  } catch {
    return { present: true, value: undefined, malformedEncoding: true };
  }
}

function decodeBase64UrlSegment(segment: string): Uint8Array | null {
  if (!segment || segment.length % 4 === 1 || /[^A-Za-z0-9_-]/.test(segment)) return null;
  try {
    return Uint8Array.from(
      atob(segment.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

function parseJsonObjectSegment(segment: string): Record<string, unknown> | null {
  const bytes = decodeBase64UrlSegment(segment);
  if (!bytes) return null;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Decode a compact `smol_token` JWT and validate:
 * - Compact base64url alphabet & padding on all three segments (header, payload, signature)
 * - Protected header parses as a strict UTF-8 plain JSON object
 * - Payload parses as a strict UTF-8 plain JSON object with non-empty string `sub`/`key`
 *   and finite numeric `exp > nowSeconds`
 *
 * Note: cryptographic signature verification still happens on the API server;
 * this prevents expired or malformed tokens from hydrating SSR/client state.
 */
export function parseSessionToken(
  rawToken: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): ParsedSessionToken | null {
  if (typeof rawToken !== 'string' || !rawToken) return null;
  const parts = rawToken.split('.');
  if (parts.length !== 3) return null;

  const [headerSeg, payloadSeg, signatureSeg] = parts;
  const header = parseJsonObjectSegment(headerSeg);
  if (!header) return null;

  const signatureBytes = decodeBase64UrlSegment(signatureSeg);
  if (!signatureBytes || signatureBytes.length === 0) return null;

  const payload = parseJsonObjectSegment(payloadSeg);
  if (!payload) return null;

  const { sub, key, exp } = payload;
  if (typeof sub !== 'string' || sub.length === 0) return null;
  if (typeof key !== 'string' || key.length === 0) return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  if (exp <= nowSeconds) return null;

  return { contractId: sub, keyId: key, exp };
}

export function getSessionCookieDeleteOptions(hostname: string): SessionCookieDeleteOptions {
  const domain = getAuthCookieDomain(hostname.toLowerCase());
  return domain === '.smol.xyz' ? { path: '/', domain } : { path: '/' };
}

/**
 * Resolve the server-side Layout session decision from a CookieReadResult.
 * - Absent cookie -> unauthenticated, no deletion, no forced Cache-Control.
 * - Any present cookie (valid, expired, malformed JWT, or malformed percent-encoding)
 *   sets `shouldSetNoStore = true` so proxies/CDNs never cache personalized HTML or
 *   cookie-clearing responses.
 * - Invalid/expired/malformed cookies clear credentials (`cid/kid = null`) and flag
 *   `shouldDeleteCookie = true` with host-appropriate deletion options.
 */
export function resolveSessionCookieRead(
  cookieRead: CookieReadResult,
  hostname: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionCookieResolution {
  const deleteCookieOptions = getSessionCookieDeleteOptions(hostname);

  if (!cookieRead.present) {
    return {
      cid: null,
      kid: null,
      shouldDeleteCookie: false,
      shouldSetNoStore: false,
      deleteCookieOptions,
    };
  }

  if (cookieRead.malformedEncoding) {
    return {
      cid: null,
      kid: null,
      shouldDeleteCookie: true,
      shouldSetNoStore: true,
      deleteCookieOptions,
    };
  }

  const parsed = parseSessionToken(cookieRead.value, nowSeconds);
  if (!parsed) {
    return {
      cid: null,
      kid: null,
      shouldDeleteCookie: true,
      shouldSetNoStore: true,
      deleteCookieOptions,
    };
  }

  return {
    cid: parsed.contractId,
    kid: parsed.keyId,
    shouldDeleteCookie: false,
    shouldSetNoStore: true,
    deleteCookieOptions,
  };
}

export function resolveSessionCookie(
  rawToken: string | undefined,
  hostname: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionCookieResolution {
  const cookieRead: CookieReadResult =
    rawToken === undefined
      ? { present: false, value: undefined, malformedEncoding: false }
      : { present: true, value: rawToken, malformedEncoding: false };
  return resolveSessionCookieRead(cookieRead, hostname, nowSeconds);
}
