/**
 * The client-written `smol_token` session cookie (pre-httpOnly cutover): one
 * place for its attributes, so a login / signup commit and the logout clear
 * write the identical name + Domain + Path tuple.
 */
import { getAuthCookieDomain } from './rpId.ts';
import { removeCookie, setCookie } from './cookies.ts';

export function sessionCookieOptions() {
  const domain = getAuthCookieDomain();
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return {
    path: '/',
    secure: isHttps,
    sameSite: 'Lax' as const,
    ...(domain ? { domain } : {}),
  };
}

export function setSessionCookie(jwt: string) {
  setCookie('smol_token', jwt, {
    ...sessionCookieOptions(),
    expires: 30,
  });
}

export function clearSessionCookies() {
  removeCookie('smol_token', sessionCookieOptions());
  removeCookie('smol_token', { path: '/' });
}
