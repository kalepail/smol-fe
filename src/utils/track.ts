import type { MixtapeTrack, Smol, SongData } from '../types/domain';

const API_URL = import.meta.env.PUBLIC_API_URL;

export interface Track {
  key: string;
  smolId: string;
  musicId: string;
  src: string;
  fallbackSrc?: string;
  title: string;
  artist?: string;
  coverUrl: string;
  liked?: boolean;
}

export function trackKey(smolId: string, musicId: string): string {
  return `${smolId}:${musicId}`;
}

export function toMixtapeTrack(smol: Smol) {
  return {
    id: smol.Id,
    title: smol.Title || 'Untitled Smol',
    creator: smol.Creator || smol.Username || smol.artist || smol.author || null,
    coverUrl: `${API_URL}/image/${smol.Id}.png`,
    public: smol.Public,
  } satisfies MixtapeTrack;
}

export function toTrack(smol: Smol, take?: SongData): Track | null {
  const musicId = take?.music_id ?? smol.Song_1;
  if (!musicId) return null;

  const complete = !take || take.status >= 4;
  const src = complete ? `${API_URL}/song/${encodeURIComponent(musicId)}.mp3` : take.audio;
  if (!src) return null;

  const { title, creator, coverUrl } = toMixtapeTrack(smol);
  return {
    key: trackKey(smol.Id, musicId),
    smolId: smol.Id,
    musicId,
    src,
    fallbackSrc: complete && take?.audio !== src ? take?.audio : undefined,
    title,
    artist: creator ?? undefined,
    coverUrl,
    liked: smol.Liked,
  };
}
