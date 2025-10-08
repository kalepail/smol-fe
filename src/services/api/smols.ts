import type { Smol } from '../../types/domain';

const API_URL = import.meta.env.PUBLIC_API_URL;

/**
 * Fetch all smols
 */
export async function fetchSmols(): Promise<Smol[]> {
  const response = await fetch(`${API_URL}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch smols: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch liked smol IDs for the current user
 */
export async function fetchLikedSmols(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(`${API_URL}/likes`, {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    return [];
  }
  return response.json();
}

/**
 * Like a smol
 */
export async function likeSmol(smolId: string): Promise<void> {
  const response = await fetch(`${API_URL}/like`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ smol_id: smolId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to like smol: ${response.statusText}`);
  }
}

/**
 * Unlike a smol
 */
export async function unlikeSmol(smolId: string): Promise<void> {
  const response = await fetch(`${API_URL}/unlike`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ smol_id: smolId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to unlike smol: ${response.statusText}`);
  }
}
