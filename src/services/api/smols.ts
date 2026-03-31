import type { Smol } from '../../types/domain';
import { fetchWithTimeout, throwIfNotOk } from './fetch';

const API_URL = import.meta.env.PUBLIC_API_URL;

/**
 * Fetch all smols
 */
export async function fetchSmols(): Promise<Smol[]> {
  const endpoint = `${API_URL}`;
  const response = await fetchWithTimeout(endpoint);
  await throwIfNotOk(response, endpoint);
  return response.json();
}

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

/**
 * Like a smol
 */
export async function likeSmol(smolId: string): Promise<void> {
  const endpoint = `${API_URL}/like`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ smol_id: smolId }),
  });

  await throwIfNotOk(response, endpoint);
}

/**
 * Unlike a smol
 */
export async function unlikeSmol(smolId: string): Promise<void> {
  const endpoint = `${API_URL}/unlike`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ smol_id: smolId }),
  });

  await throwIfNotOk(response, endpoint);
}
