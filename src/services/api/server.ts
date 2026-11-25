import {
  parseSessionToken,
  readSessionCookieFromRequest,
  type SafeCookieSource,
} from '../../utils/sessionToken.ts';

const API_ORIGIN = 'https://api.smol.xyz';
const SSR_TIMEOUT = 2500;

export interface ServerApiFetchContext {
  request?: {
    headers: {
      get(name: string): string | null;
    };
  };
  /** Worker bindings (src/services/api/ssr.ts). No `SMOL_API` (Node tests, `astro dev`) = HTTP. */
  env?: {
    SMOL_API?: { fetch(request: Request): Promise<Response> };
  };
  cookies: {
    has?(name: string): boolean;
    get(
      name: string,
      options?: { decode?: (value: string) => string },
    ): { value: string } | undefined;
  };
  response: {
    headers: Headers;
  };
}

export interface ServerApiFetchOptions {
  /**
   * Forward the `smol_token` Cookie header to the API.
   * Only enable for personalized SSR routes (such as `/[id]` for private songs);
   * leave false/omitted on shared/public SSR routes.
   */
  forwardAuth?: boolean;
  /** Optional override for PUBLIC_API_URL (used in unit tests). */
  apiUrl?: string;
  /** Optional override for global fetch (used in unit tests). */
  fetchImpl?: typeof fetch;
  /** Optional per-request timeout in ms. */
  timeoutMs?: number;
}

async function cancelBodySafely(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort stream disposal; never turn a handled non-2xx response into a rejection.
  }
}

export async function serverApiFetch<T>(
  { request, env, cookies, response }: ServerApiFetchContext,
  path: string,
  options: ServerApiFetchOptions = {},
): Promise<T | null> {
  const {
    forwardAuth = false,
    fetchImpl = fetch,
    timeoutMs = SSR_TIMEOUT,
  } = options;

  const headers = new Headers();
  if (forwardAuth) {
    const cookieRead = readSessionCookieFromRequest({ request, cookies });
    if (cookieRead.present) {
      response.headers.set('Cache-Control', 'private, no-store');
      if (!cookieRead.malformedEncoding && cookieRead.value) {
        headers.set('Cookie', `smol_token=${encodeURIComponent(cookieRead.value)}`);
      }
    }
  }

  const binding = env?.SMOL_API;
  if (binding) {
    let result: Response | null = null;
    try {
      result = await binding.fetch(new Request(`${API_ORIGIN}${path}`, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      }));
    } catch {
      // Local or unavailable binding / transport error. Try the configured HTTP endpoint.
    }

    if (result) {
      if (result.ok) {
        try {
          return await result.json() as T;
        } catch {
          return null;
        }
      }
      await cancelBodySafely(result);
      // The binding reached SMOL_API and got a definitive HTTP response (e.g. 4xx/5xx);
      // stop immediately without issuing a duplicate public HTTP fetch.
      return null;
    }
  }

  const configuredApiUrl =
    options.apiUrl ??
    (import.meta as { env?: { PUBLIC_API_URL?: string } }).env?.PUBLIC_API_URL;
  const apiUrl = configuredApiUrl?.replace(/\/$/, '');
  if (!apiUrl) return null;

  try {
    const result = await fetchImpl(`${apiUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (result.ok) return await result.json() as T;
    await cancelBodySafely(result);
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
  { request, env, cookies, response }: ServerApiFetchContext,
  path: string,
  options: ServerApiFetchOptions = {},
): Promise<ServerApiResult<T>> {
  const {
    forwardAuth = false,
    fetchImpl = fetch,
    timeoutMs = SSR_TIMEOUT,
  } = options;

  const headers = new Headers();
  if (forwardAuth) {
    const cookieRead = readSessionCookieFromRequest({ request, cookies });
    if (cookieRead.present) {
      response.headers.set('Cache-Control', 'private, no-store');
      if (!cookieRead.malformedEncoding && cookieRead.value) {
        headers.set('Cookie', `smol_token=${encodeURIComponent(cookieRead.value)}`);
      }
    }
  }

  const read = async (result: Response): Promise<ServerApiResult<T>> => {
    const data = await result.json().catch(() => null);
    return { status: result.status, data: data as T | null };
  };

  const binding = env?.SMOL_API;
  if (binding) {
    let result: Response | null = null;
    try {
      result = await binding.fetch(new Request(`${API_ORIGIN}${path}`, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      }));
    } catch {
      // Local or unavailable binding / transport error. Try the configured HTTP endpoint.
    }

    if (result) {
      if (result.ok || result.status === 404) return await read(result);
      await cancelBodySafely(result);
      // Definitive HTTP response from binding — do not issue a duplicate public HTTP fetch.
      return { status: result.status, data: null };
    }
  }

  const configuredApiUrl =
    options.apiUrl ??
    (import.meta as { env?: { PUBLIC_API_URL?: string } }).env?.PUBLIC_API_URL;
  const apiUrl = configuredApiUrl?.replace(/\/$/, '');
  if (!apiUrl) return { status: 0, data: null };

  try {
    const result = await fetchImpl(`${apiUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await read(result);
  } catch {
    return { status: 0, data: null };
  }
}

/**
 * The validated, unexpired session subject (`sub`) from the `smol_token` cookie
 * (exception-safe against malformed percent-encoding; cryptographic verification
 * remains at the API).
 */
export function sessionSubject(source: SafeCookieSource): string | null {
  const cookieRead = readSessionCookieFromRequest(source);
  if (!cookieRead.present || cookieRead.malformedEncoding || !cookieRead.value) {
    return null;
  }
  return parseSessionToken(cookieRead.value)?.contractId ?? null;
}
