// A mixtape owner with a REAL contract address, so the t488 collector can read
// ownership through the stellar mock (25d P1-1 regression). Re-uses the
// collector fixtures' canonical tracks without changing them.
import { StrKey, hash } from '@stellar/stellar-sdk';
import { mixedTracks, unindexedSong } from './collect.mjs';

export const CHAIN_OWNER = StrKey.encodeContract(hash(Buffer.from('smol-e2e-mixtape-owner')));
export const CHAIN_TAG = 'chain';
/** Minted on chain AND indexed in D1 (carries Mint_Token / Mint_Amm). */
export const CHAIN_TRACK_INDEXED = mixedTracks[0];
/** Minted on chain but NOT indexed in D1 (no Mint fields): ownership only shows after a chain read. */
export const CHAIN_TRACK_UNINDEXED = unindexedSong;
export const chainTracks = [CHAIN_TRACK_INDEXED, CHAIN_TRACK_UNINDEXED];
