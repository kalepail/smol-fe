/**
 * Core domain types for the Smol application
 */

export type MusicProvider = 'aisonggenerator' | 'elevenlabs';

export interface Smol {
  Id: string;
  Title: string;
  Creator?: string;
  Username?: string;
  artist?: string;
  author?: string;
  Song_1?: string;
  Song_2?: string | null;
  Liked?: boolean;
  Address?: string;
  Public?: number;
  Mint_Token?: string;
  Mint_Amm?: string;
  Created_At?: string;
  Plays?: number;
  Views?: number;
  lyrics?: {
    title?: string;
    style?: string[];
    lyrics?: string;
  };
  // Client-side only fields for UI state
  balance?: bigint;
  minting?: boolean;
}

export interface MixtapeTrack {
  id: string;
  title: string;
  coverUrl: string | null;
  creator: string | null;
  public?: number;
}

export interface MixtapeDraft {
  draftId: string;
  title: string;
  description: string;
  tracks: MixtapeTrack[];
  updatedAt: string;
}

export interface PublishedMixtape {
  id: string;
  title: string;
  description: string;
  tracks: MixtapeTrack[];
  createdAt: string;
  creator: string;
}

export interface User {
  contractId: string;
  keyId: string;
  username?: string;
}

export interface GenerationMeta {
  requested_provider: MusicProvider;
  actual_provider: MusicProvider | null;
}

/**
 * API response types for Smol detail endpoint
 */
export interface SmolDetailResponse {
  d1?: {
    Id: string;
    Title: string;
    Address?: string;
    Creator?: string;
    Username?: string;
    artist?: string;
    author?: string;
    Song_1?: string;
    Song_2?: string | null;
    Public?: number;
    Mint_Token?: string;
    Mint_Amm?: string;
    Instrumental?: number;
    Created_At?: string;
    Plays?: number;
    Views?: number;
    Playlist?: string | null;
    Requested_Provider?: MusicProvider | null;
    Actual_Provider?: MusicProvider | null;
  };
  kv_do?: {
    payload?: {
      address?: string;
      prompt?: string;
      instrumental?: boolean;
      public?: boolean;
      playlist?: string;
      provider?: MusicProvider;
    };
    requested_provider?: MusicProvider;
    active_provider?: MusicProvider;
    actual_provider?: MusicProvider | null;
    fallback_from?: MusicProvider;
    fallback_reason?: string;
    generation_meta?: GenerationMeta;
    description?: string;
    nsfw?: {
      safe: boolean;
      categories: string[];
      unknown?: boolean;
    };
    lyrics?: {
      title?: string;
      style?: string[];
      lyrics?: string;
    };
    songs?: SongData[];
    image?: boolean;
    failure?: {
      code: 'content_policy' | 'generation_timeout' | 'provider_unavailable' | 'generation_failed' | 'terminated';
      title: string;
      message: string;
      retryable: boolean;
      /** The model itself is down: offer the other one even when not retryable. */
      suggestAlternate?: boolean;
    };
  };
  wf?: {
    status: 'queued' | 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'waiting' | 'waitingForPause' | 'unknown';
  };
  liked?: boolean;
  /** True when the song's cover + primary MP3 exist in R2 within the iMessage/Discord video size cap. */
  video_eligible?: boolean;
}

export interface SongData {
  music_id: string;
  audio?: string;
  status: number;
  /** Seconds, when the workflow recorded it. */
  duration?: number;
}

export interface SearchExplanation {
  matchedFields: string[];
  style?: string[];
  mood?: string;
  theme?: string;
}

export interface SearchResult extends Smol {
  Created_At?: string;
  score: number;
  explanation?: SearchExplanation;
}

export interface SearchResponse {
  results: SearchResult[];
}
