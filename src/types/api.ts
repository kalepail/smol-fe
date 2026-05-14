/**
 * API request and response types
 */

import type { Smol, PublishedMixtape, MixtapeDraft } from './domain';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';

export interface LoginRequest {
  type: 'connect' | 'create';
  keyId: string;
  contractId: string;
  response: AuthenticationResponseJSON | RegistrationResponseJSON;
  username?: string;
}

export interface LoginResponse {
  token: string;
}

export interface FetchSmolsResponse extends Array<Smol> {}

export interface FetchLikesResponse extends Array<string> {}

export interface Pagination {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ArtistProfile {
  Username: string;
  Address: string;
}

export interface SmolListResponse {
  smols: Smol[];
  users?: ArtistProfile[];
  pagination?: Pagination;
}

export interface ArtistSmolsResponse extends SmolListResponse {
  artist: ArtistProfile | null;
  users: ArtistProfile[];
  pagination: Pagination;
}

export interface LikeRequest {
  smolId: string;
}

export interface PublishMixtapeRequest {
  title: string;
  description: string;
  tracks: MixtapeDraft['tracks'];
}

export interface PublishMixtapeResponse {
  id: string;
  mixtape: PublishedMixtape;
}

export interface MintRequest {
  smolId: string;
  amount: string;
}

export interface TradeRequest {
  smolId: string;
  amount: string;
  isBuy: boolean;
}

export interface BalanceResponse {
  balance: string; // bigint as string
}
