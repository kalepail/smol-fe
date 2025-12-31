import type { MixtapeDraft, SmolDetailResponse, SongData } from '../../types/domain';

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
 * Get auth headers from smol_token cookie.
 * This enables cross-origin authenticated requests (e.g., localhost -> api.smol.xyz)
 * since cookies are domain-bound and won't be sent cross-origin.
 */
function getAuthHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};

  const cookies = document.cookie.split('; ');
  const tokenCookie = cookies.find(c => c.startsWith('smol_token='));
  if (!tokenCookie) return {};

  const token = tokenCookie.split('=')[1];
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/**
 * Publish a new mixtape
 */
export async function publishMixtape(draft: MixtapeDraft): Promise<{ id: string }> {
  const response = await fetch(`${API_URL}/mixtapes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify({
      title: draft.title || 'Untitled Mixtape',
      desc: draft.description,
      smols: draft.tracks.map((track) => track.id),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to publish mixtape: ${response.statusText}`);
  }

  const data: { id: string } = await response.json();
  return data;
}

/**
 * Update an existing mixtape
 */
export async function updateMixtape(id: string, draft: MixtapeDraft): Promise<{ id: string }> {
  const response = await fetch(`${API_URL}/mixtapes/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify({
      title: draft.title || 'Untitled Mixtape',
      desc: draft.description,
      smols: draft.tracks.map((track) => track.id),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update mixtape: ${response.statusText}`);
  }

  const data: { id: string } = await response.json();
  return data;
}

/**
 * List all mixtapes
 */
export async function listMixtapes(): Promise<MixtapeSummary[]> {
  const response = await fetch(`${API_URL}/mixtapes`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch mixtapes: ${response.statusText}`);
  }

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
  const response = await fetch(`${API_URL}/mixtapes/${id}`, {
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch mixtape detail: ${response.statusText}`);
  }

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

  // Check for locally saved track order
  const savedOrderJson = localStorage.getItem(`mixtape-order:${data.Id}`);
  let orderedTracks = data.Smols;
  if (savedOrderJson) {
    try {
      const savedOrder: string[] = JSON.parse(savedOrderJson);
      console.log('[MOCK] Found saved track order:', savedOrder);
      // Reorder tracks based on saved order
      const trackMap = new Map(data.Smols.map((t) => [t.Id, t]));
      orderedTracks = savedOrder
        .map((id) => trackMap.get(id))
        .filter((t): t is MixtapeSmolData => t !== undefined);
      // Add any tracks that weren't in the saved order (safety)
      const savedSet = new Set(savedOrder);
      for (const track of data.Smols) {
        if (!savedSet.has(track.Id)) {
          orderedTracks.push(track);
        }
      }
    } catch (e) {
      console.error('[MOCK] Failed to parse saved order:', e);
    }
  }

  return {
    id: data.Id,
    title: data.Title,
    description: data.Desc,
    trackCount: orderedTracks.length,
    coverUrls,
    updatedAt: data.Created_At,
    creator: data.Address,
    tracks: orderedTracks,
  };
}

/**
 * Get smol track data by ID
 */
export async function getSmolTrackData(smolId: string): Promise<SmolTrackData> {
  const response = await fetch(`${API_URL}/${smolId}`);

  if (!response.ok) {
    return {
      id: smolId,
      title: 'Failed to load',
      creator: null,
      coverUrl: null,
      audioUrl: null,
      lyrics: null,
    };
  }

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
}
