import type { MixtapeDraft } from '../../types/domain';
import { fetchWithTimeout, LONG_TIMEOUT, throwIfNotOk } from './fetch';

export interface MixtapeSummary {
  id: string;
  title: string;
  description: string;
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

interface ApiMixtape {
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
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      title: draft.title || 'Untitled Mixtape',
      desc: draft.description,
      smols: draft.tracks.map((track) => track.id),
    }),
    timeout: LONG_TIMEOUT,
  });

  await throwIfNotOk(response, endpoint);

  const data: { id: string } = await response.json();
  return data;
}

export async function listMixtapes(): Promise<MixtapeSummary[]> {
  const endpoint = `${API_URL}/mixtapes`;
  const response = await fetchWithTimeout(endpoint, {
    credentials: 'include',
  });

  await throwIfNotOk(response, endpoint);

  const data: ApiMixtape[] = await response.json();

  return data.filter((mixtape) => mixtape.Smols.length > 0).map((mixtape) => {
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
      trackCount: mixtape.Smols.length,
      coverUrls,
      updatedAt: mixtape.Created_At,
    };
  });
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
