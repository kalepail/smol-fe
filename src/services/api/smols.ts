import { fetchWithTimeout, throwIfNotOk } from './fetch';

const API_URL = import.meta.env.PUBLIC_API_URL;

/**
 * Fetch liked smol IDs for the current user
 */
export async function fetchLikedSmols(signal?: AbortSignal): Promise<string[]> {
  const endpoint = `${API_URL}/likes`;
  const response = await fetchWithTimeout(endpoint, {
    credentials: 'include',
    signal,
  });
  await throwIfNotOk(response, endpoint);
  return response.json();
}
