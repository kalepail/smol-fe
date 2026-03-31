import type { MixtapeDraft, SmolDetailResponse, SongData } from '../../types/domain';
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

export interface SmolTrackData {
  id: string;
  title: string | null;
  creator: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  lyrics: {
    title?: string;
    style?: string[];
  } | null;
}

const API_URL = import.meta.env.PUBLIC_API_URL!;

/**
 * Publish a new mixtape
 */
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

/**
 * List all mixtapes
 */
export async function listMixtapes(): Promise<MixtapeSummary[]> {
  const endpoint = `${API_URL}/mixtapes`;
  const response = await fetchWithTimeout(endpoint, {
    credentials: 'include',
  });

  await throwIfNotOk(response, endpoint);

  const data: ApiMixtape[] = await response.json();

  const mixtapes = await Promise.all(
    data.map(async (mixtape) => {
      const coverUrls: (string | null)[] = [];

      for (let i = 0; i < Math.min(4, mixtape.Smols.length); i++) {
        const smolId = mixtape.Smols[i];
        if (smolId) {
          coverUrls.push(`${API_URL}/image/${smolId}.png`);
        } else {
          coverUrls.push(null);
        }
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
    })
  );

  return mixtapes;
}

interface ApiMixtapeDetail {
  Id: string;
  Title: string;
  Desc: string;
  Address: string;
  Created_At: string;
  Smols: MixtapeSmolData[];
}

/**
 * Get mixtape detail by ID
 */
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

  const data: ApiMixtapeDetail = await response.json();

  // Generate cover URLs from the first 4 tracks
  const coverUrls: (string | null)[] = [];
  for (let i = 0; i < Math.min(4, data.Smols.length); i++) {
    const smol = data.Smols[i];
    if (smol?.Id) {
      coverUrls.push(`${API_URL}/image/${smol.Id}.png`);
    } else {
      coverUrls.push(null);
    }
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

/**
 * Get smol track data by ID.
 *
 * Returns `null` when the request fails (network error, non-ok status, etc.)
 * so callers can degrade gracefully instead of crashing.
 */
export async function getSmolTrackData(smolId: string): Promise<SmolTrackData | null> {
  try {
    const endpoint = `${API_URL}/${smolId}`;
    const response = await fetchWithTimeout(endpoint);

    await throwIfNotOk(response, endpoint);

    const data: SmolDetailResponse = await response.json();
    const d1 = data?.d1;
    const kv_do = data?.kv_do;

    const bestSong = d1?.Song_1;
    const songs: SongData[] = kv_do?.songs || [];
    const bestSongData = songs.find((s) => s.music_id === bestSong);

    return {
      id: smolId,
      title: kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null,
      creator: d1?.Address ?? null,
      coverUrl: `${API_URL}/image/${smolId}.png` as string,
      audioUrl: (bestSongData && bestSongData.status < 4
        ? bestSongData.audio
        : bestSongData?.music_id
          ? `${API_URL}/song/${bestSongData.music_id}.mp3`
          : null) ?? null,
      lyrics: kv_do?.lyrics
        ? {
            title: kv_do.lyrics.title,
            style: kv_do.lyrics.style,
          }
        : null,
    };
  } catch {
    return null;
  }
}
