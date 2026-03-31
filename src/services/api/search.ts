import type { SearchResponse } from '../../types/domain';
import { ApiError, fetchWithTimeout, throwIfNotOk } from './fetch';

const API_URL = import.meta.env.PUBLIC_API_URL;

function buildSearchUrl(pathname: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${API_URL}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export async function searchSmols(params: {
  query: string;
  limit?: number;
  instrumental?: boolean;
}): Promise<SearchResponse> {
  const endpoint = buildSearchUrl('/search', {
    q: params.query,
    limit: params.limit,
    instrumental: typeof params.instrumental === 'boolean' ? String(params.instrumental) : undefined,
  });
  const response = await fetchWithTimeout(endpoint, {
    credentials: 'include',
  });

  await throwIfNotOk(response, endpoint);

  return response.json();
}

export async function searchSimilarSmols(params: {
  id: string;
  refine?: string;
  limit?: number;
}): Promise<SearchResponse> {
  const endpoint = buildSearchUrl(`/search/${params.id}/similar`, {
    refine: params.refine,
    limit: params.limit,
  });
  const response = await fetchWithTimeout(endpoint, {
    credentials: 'include',
  });

  if (!response.ok && response.status === 409) {
    throw new ApiError(409, 'Search indexing still in progress for this smol', endpoint);
  }

  await throwIfNotOk(response, endpoint);

  return response.json();
}
