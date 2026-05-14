import type { ArtistSmolsResponse } from '../../types/api';
import { fetchWithTimeout, throwIfNotOk } from './fetch';

const API_URL = import.meta.env.PUBLIC_API_URL;

interface FetchArtistSmolsOptions {
  limit?: number;
  cursor?: string | null;
  cookie?: string;
  signal?: AbortSignal;
}

export async function fetchArtistSmols(
  address: string,
  { limit = 100, cursor = null, cookie, signal }: FetchArtistSmolsOptions = {}
): Promise<ArtistSmolsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const endpoint = `${API_URL}/artists/${encodeURIComponent(address)}/smols?${params}`;
  const response = await fetchWithTimeout(endpoint, {
    headers: cookie ? { Cookie: cookie } : undefined,
    signal,
  });

  await throwIfNotOk(response, endpoint);
  return response.json();
}
