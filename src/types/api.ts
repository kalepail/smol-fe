/**
 * API request and response types
 */

import type { Smol, PublishedMixtape, MixtapeDraft } from './domain';

export interface LoginRequest {
  type: 'connect' | 'create';
  keyId: string;
  contractId: string;
  response: any; // AuthenticationResponseJSON from passkey-kit
  username?: string;
}

export interface LoginResponse {
  token: string;
}

export interface FetchSmolsResponse extends Array<Smol> {}

export interface FetchLikesResponse extends Array<string> {}

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
