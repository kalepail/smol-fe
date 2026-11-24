/**
 * Minimal native `document.cookie` writer (replaces js-cookie, CVE-2026-46625).
 *
 * Byte-for-byte compatible with js-cookie@3 `Cookies.set` / `Cookies.remove`
 * for the attributes SMOL uses, so existing `smol_token` cookies are
 * overwritten / deleted with the identical name + domain + path tuple:
 * - default `path=/`, attributes serialised in insertion order, `true` → bare flag,
 *   falsy → omitted, every value truncated at the first `;` (no attribute injection);
 * - numeric `expires` = days from now (UTC string); `remove` = set '' with expires -1;
 * - name/value encoded with js-cookie's RFC 6265 rules.
 */
export interface CookieAttributes {
  path?: string;
  domain?: string;
  /** Days from now (number) or an absolute Date. */
  expires?: number | Date;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface CookieTarget {
  cookie: string;
}

const DAY_MS = 864e5;

export function encodeCookieName(name: string): string {
  return encodeURIComponent(name)
    .replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent)
    .replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function encodeCookieValue(value: string): string {
  return encodeURIComponent(value).replace(
    /%(2[346BF]|3[AC-F]|40|5[BDE]|60|7[BCD])/g,
    decodeURIComponent
  );
}

export function serializeCookie(
  name: string,
  value: string,
  attributes: CookieAttributes = {},
  now: number = Date.now()
): string {
  const attrs: Record<string, string | number | boolean | Date | undefined> = {
    path: '/',
    ...attributes,
  };

  if (typeof attrs.expires === 'number') {
    attrs.expires = new Date(now + attrs.expires * DAY_MS);
  }
  if (attrs.expires instanceof Date) {
    attrs.expires = attrs.expires.toUTCString();
  }

  let out = `${encodeCookieName(name)}=${encodeCookieValue(value)}`;
  for (const [key, val] of Object.entries(attrs)) {
    if (!val) continue;
    out += `; ${key}`;
    if (val === true) continue;
    out += `=${String(val).split(';')[0]}`;
  }
  return out;
}

function defaultTarget(): CookieTarget | null {
  return typeof document === 'undefined' ? null : document;
}

export function setCookie(
  name: string,
  value: string,
  attributes: CookieAttributes = {},
  target: CookieTarget | null = defaultTarget()
): string | undefined {
  if (!target) return undefined;
  const serialized = serializeCookie(name, value, attributes);
  target.cookie = serialized;
  return serialized;
}

export function removeCookie(
  name: string,
  attributes: Omit<CookieAttributes, 'expires'> = {},
  target: CookieTarget | null = defaultTarget()
): string | undefined {
  return setCookie(name, '', { ...attributes, expires: -1 }, target);
}
