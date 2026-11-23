import type { AstroGlobal } from 'astro';

const API_ORIGIN = 'https://api.smol.xyz';
const SSR_TIMEOUT = 2500;

export async function serverApiFetch<T>(
  { locals, cookies, response }: Pick<AstroGlobal, 'locals' | 'cookies' | 'response'>,
  path: string,
): Promise<T | null> {
  const token = cookies.get('smol_token');
  const headers = new Headers();
  if (token) {
    headers.set('Cookie', `smol_token=${encodeURIComponent(token.value)}`);
    response.headers.set('Cache-Control', 'private, no-store');
  }

  const binding = locals.runtime?.env.SMOL_API;
  if (binding) {
    try {
      const result = await binding.fetch(new Request(`${API_ORIGIN}${path}`, {
        headers,
        signal: AbortSignal.timeout(SSR_TIMEOUT),
      }));
      if (result.ok) return await result.json() as T;
      await result.body?.cancel();
    } catch {
      // Local or unavailable binding. Try the configured HTTP endpoint.
    }
  }

  const apiUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) return null;

  try {
    const result = await fetch(`${apiUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(SSR_TIMEOUT),
    });
    if (result.ok) return await result.json() as T;
    await result.body?.cancel();
  } catch {
    // The island can retry through its normal browser API client.
  }
  return null;
}

export interface ServerApiResult<T> {
  /** HTTP status, or 0 when the API could not be reached at all. */
  status: number;
  data: T | null;
}

/**
 * Like `serverApiFetch`, but keeps the status and parses non-2xx JSON bodies,
 * so SSR can tell a real 404 (or a `mixtape_merged` 404 → redirect) from an
 * unreachable API (let the island retry).
 */
export async function serverApiFetchResult<T>(
  { locals, cookies, response }: Pick<AstroGlobal, 'locals' | 'cookies' | 'response'>,
  path: string,
): Promise<ServerApiResult<T>> {
  const token = cookies.get('smol_token');
  const headers = new Headers();
  if (token) {
    headers.set('Cookie', `smol_token=${encodeURIComponent(token.value)}`);
    response.headers.set('Cache-Control', 'private, no-store');
  }

  const read = async (result: Response): Promise<ServerApiResult<T>> => {
    const data = await result.json().catch(() => null);
    return { status: result.status, data: data as T | null };
  };

  const binding = locals.runtime?.env.SMOL_API;
  if (binding) {
    try {
      const result = await binding.fetch(new Request(`${API_ORIGIN}${path}`, {
        headers,
        signal: AbortSignal.timeout(SSR_TIMEOUT),
      }));
      if (result.ok || result.status === 404) return await read(result);
      await result.body?.cancel();
    } catch {
      // Local or unavailable binding. Try the configured HTTP endpoint.
    }
  }

  const apiUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) return { status: 0, data: null };

  try {
    const result = await fetch(`${apiUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(SSR_TIMEOUT),
    });
    return await read(result);
  } catch {
    return { status: 0, data: null };
  }
}

/** The session subject (`sub`) from the smol_token cookie, without verifying it (display-only). */
export function sessionSubject({ cookies }: Pick<AstroGlobal, 'cookies'>): string | null {
  const payload = cookies.get('smol_token')?.value?.split('.')?.[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const { sub } = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}
