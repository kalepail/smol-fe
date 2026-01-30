/**
 * Core domain types for the Smol application
 */

export interface SmolKV {
  payload?: {
    prompt?: string;
    instrumental?: boolean;
  };
  description?: string;
  image_base64?: string;
  nsfw?: {
    safe: boolean;
    categories: string[];
  };
  lyrics?: {
    title?: string;
    style?: string[];
    lyrics?: string;
  };
  songs?: SongData[];
}

export interface Smol {
  Id: string;
  Title: string;
  Description?: string;
  Creator?: string;
  Username?: string;
  artist?: string;
  author?: string;
  Song_1?: string;
  Liked?: boolean;
  Address?: string;
  Plays?: number;
  Views?: number;
  Mint_Token?: string;
  Mint_Amm?: string;
  Minted_By?: string; // Wallet address of who minted/owns the token
  Tags?: string[]; // Extracted styles/tags for visualization
  lyrics?: {
    title?: string;
    style?: string[];
    lyrics?: string;
  };
  kv_do?: SmolKV;
  // Client-side only fields for UI state
  balance?: bigint;
  minting?: boolean;
  Created_At?: string;
}

export interface MixtapeTrack {
  id: string;
  title: string;
  coverUrl: string | null;
  creator: string | null;
}

export interface MixtapeDraft {
  draftId?: string;
  title: string;
  description: string;
  tracks: MixtapeTrack[];
  updatedAt?: string;
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

export interface AudioState {
  playingId: string | null;
  currentSong: Smol | null;
  progress: number;
}

export interface MixtapeModeState {
  active: boolean;
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
    Song_1?: string;
    Public?: number;
    Mint_Token?: string;
    Mint_Amm?: string;
    Instrumental?: number;
    Created_At?: string;
  };
  kv_do?: SmolKV;
  wf?: {
    status: 'queued' | 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'waiting' | 'waitingForPause' | 'unknown';
  };
  liked?: boolean;
}

export interface SongData {
  music_id: string;
  audio?: string;
  status: number;
}
