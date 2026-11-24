/**
 * API request and response types
 */

import type { Smol } from './domain';

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
