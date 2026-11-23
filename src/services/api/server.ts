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
