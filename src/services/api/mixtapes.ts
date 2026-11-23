import type { MixtapeDraft } from '../../types/domain';
import { ApiError, fetchWithTimeout, LONG_TIMEOUT, throwIfNotOk } from './fetch';

export type MixtapePublishErrorKind = 'auth' | 'network' | 'invalid_response' | 'server';

export class MixtapePublishError extends Error {
  readonly kind: MixtapePublishErrorKind;
  readonly status?: number;

  constructor(message: string, kind: MixtapePublishErrorKind, status?: number) {
    super(message);
    this.name = 'MixtapePublishError';
    this.kind = kind;
    this.status = status;
  }
}

export interface MixtapeSummary {
  id: string;
  title: string;
  description: string;
  creator: string;
  trackCount: number;
  coverUrls: (string | null)[];
  updatedAt: string;
}

export interface MixtapeSmolData {
  Id: string;
  Title: string;
  Address: string;
  Mint_Token?: string;
  Mint_Amm?: string;
  Song_1?: string;
  Public?: number;
  Tags?: string[];
}

export interface MixtapeDetail extends MixtapeSummary {
  tracks: MixtapeSmolData[];
  creator: string;
}

export interface ApiMixtape {
  Id: string;
  Title: string;
  Desc: string;
  Smols: string[];
  Address: string;
  Created_At: string;
}

export interface ApiMixtapeDetail {
  Id: string;
  Title: string;
  Desc: string;
  Address: string;
  Created_At: string;
  Smols: MixtapeSmolData[];
}

const API_URL = import.meta.env.PUBLIC_API_URL!;

export async function publishMixtape(draft: MixtapeDraft): Promise<{ id: string }> {
  const endpoint = `${API_URL}/mixtapes`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        title: draft.title.trim() || 'Untitled mixtape',
        desc: draft.description,
        smols: draft.tracks.map((track) => track.id),
      }),
      timeout: LONG_TIMEOUT,
    });
  } catch {
    throw new MixtapePublishError(
      'Couldn’t reach SMOL. Your draft is safe — check your connection and try again.',
      'network'
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new MixtapePublishError(
      'Your session expired. Sign in again to publish — your draft is safe.',
      'auth',
      response.status
    );
  }

  try {
    await throwIfNotOk(response, endpoint);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new MixtapePublishError(
        'Could not publish right now. Your draft is safe — please try again.',
        'server',
        err.status
      );
    }
    throw err;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new MixtapePublishError(
      'Publish response could not be read. Your draft is safe — please try again.',
      'invalid_response'
    );
  }

  const rawId =
    data && typeof data === 'object'
      ? ((data as { id?: unknown; Id?: unknown }).id ?? (data as { Id?: unknown }).Id)
      : undefined;
  const id = typeof rawId === 'string' ? rawId.trim() : '';

  if (!id || id === 'undefined' || id === 'null') {
    throw new MixtapePublishError(
      'Publish did not return a mixtape ID. Your draft is safe — please try again.',
      'invalid_response'
    );
  }

  return { id };
}

export function toMixtapeSummaries(data: ApiMixtape[]): MixtapeSummary[] {
  return data.filter((mixtape) => Array.isArray(mixtape.Smols) && mixtape.Smols.length > 0).map((mixtape) => {
    const coverUrls: (string | null)[] = [];

    for (let i = 0; i < Math.min(4, mixtape.Smols.length); i++) {
      const smolId = mixtape.Smols[i];
      coverUrls.push(smolId ? `${API_URL}/image/${smolId}.png` : null);
    }

    while (coverUrls.length < 4) {
      coverUrls.push(null);
    }

    return {
      id: mixtape.Id,
      title: mixtape.Title,
      description: mixtape.Desc,
      creator: mixtape.Address,
      trackCount: mixtape.Smols.length,
      coverUrls,
      updatedAt: mixtape.Created_At,
    };
  });
}

export async function listMixtapes(): Promise<MixtapeSummary[]> {
  const endpoint = `${API_URL}/mixtapes`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      credentials: 'include',
    });
  } catch {
    throw new Error('Couldn’t reach SMOL right now. Check your connection and try again.');
  }

  await throwIfNotOk(response, endpoint);

  const data: ApiMixtape[] = await response.json();
  return toMixtapeSummaries(data);
}

export async function getMixtapeDetail(
  id: string,
  signal?: AbortSignal
): Promise<MixtapeDetail | null> {
  const endpoint = `${API_URL}/mixtapes/${id}`;
  const response = await fetchWithTimeout(endpoint, {
    credentials: 'include',
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  await throwIfNotOk(response, endpoint);

  return toMixtapeDetail(await response.json());
}

export function toMixtapeDetail(data: ApiMixtapeDetail): MixtapeDetail {
  const coverUrls: (string | null)[] = [];
  for (let i = 0; i < Math.min(4, data.Smols.length); i++) {
    const smol = data.Smols[i];
    coverUrls.push(smol?.Id ? `${API_URL}/image/${smol.Id}.png` : null);
  }
  while (coverUrls.length < 4) {
    coverUrls.push(null);
  }

  return {
    id: data.Id,
    title: data.Title,
    description: data.Desc,
    trackCount: data.Smols.length,
    coverUrls,
    updatedAt: data.Created_At,
    creator: data.Address,
    tracks: data.Smols,
  };
}
