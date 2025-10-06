import { untrack } from 'svelte';
import { Client as SmolClient } from 'smol-sdk';
import { Asset } from '@stellar/stellar-sdk/minimal';
import { getDomain } from 'tldts';
import type { MixtapeTrack, Smol } from '../types/domain';
import { rpc } from '../utils/base';
import { account } from '../utils/passkey-kit';
import { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from '../utils/mint';

interface MintingState {
  mintIntervals: Map<string, NodeJS.Timeout>;
  mintTimeouts: Map<string, NodeJS.Timeout>;
}

interface MintBatchParams {
  tracksWithData: Array<{ track: MixtapeTrack; trackData: Smol }>;
  smolContractId: string;
  userContractId: string;
  userKeyId: string;
  kaleSacId: string;
}

interface MintAllTracksParams {
  mixtapeTracks: Smol[];
  userContractId: string;
  userKeyId: string;
}

export function useMixtapeMinting() {
  const mintingState: MintingState = {
    mintIntervals: new Map(),
    mintTimeouts: new Map(),
  };

  function clearMintPolling(trackId: string) {
    const interval = mintingState.mintIntervals.get(trackId);
    if (interval) {
      clearInterval(interval);
      mintingState.mintIntervals.delete(trackId);
    }

    const timeout = mintingState.mintTimeouts.get(trackId);
    if (timeout) {
      clearTimeout(timeout);
      mintingState.mintTimeouts.delete(trackId);
    }
  }

  function clearAllMintPolling() {
    for (const trackId of mintingState.mintIntervals.keys()) {
      clearMintPolling(trackId);
    }
  }

  async function pollTrackMintStatus(
    trackId: string,
    onMinted: (trackId: string, mintToken: string, mintAmm: string) => void
  ): Promise<void> {
    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}/${trackId}`,
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        const d1 = data?.d1;

        if (d1?.Mint_Token && d1?.Mint_Amm) {
          clearMintPolling(trackId);
          onMinted(trackId, d1.Mint_Token, d1.Mint_Amm);
        }
      }
    } catch (error) {
      console.error(`Error polling mint status for ${trackId}:`, error);
    }
  }

  async function mintBatch(
    params: MintBatchParams,
    onMinted: (trackId: string, mintToken: string, mintAmm: string) => void
  ): Promise<void> {
    const { tracksWithData, smolContractId, userContractId, userKeyId, kaleSacId } = params;

    // Prepare arrays for coin_them
    const assetBytesArray: Buffer[] = [];
    const saltsArray: Buffer[] = [];
    const feeRulesArray: Array<
      | {
          fee_asset: string;
          recipients: Array<{ percent: bigint; recipient: string }>;
        }
      | undefined
    > = [];
    const issuer = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';

    for (const { track, trackData } of tracksWithData) {
      const salt = Buffer.from(track.id.padStart(64, '0'), 'hex');
      if (salt.length !== 32) {
        throw new Error(`Invalid smol identifier for minting: ${track.id}`);
      }

      const assetCode = track.id.padStart(64, '0').substring(0, 12);
      const asset = new Asset(assetCode, issuer);

      assetBytesArray.push(Buffer.from(asset.toXDRObject().toXDR()));
      saltsArray.push(salt);

      // Build fee_rule for this track
      const creatorAddress = trackData.Address!;

      if (creatorAddress === userContractId) {
        // Same address - give 50% to the single recipient
        feeRulesArray.push({
          fee_asset: kaleSacId,
          recipients: [
            {
              percent: 50_00000n,
              recipient: creatorAddress,
            },
          ],
        });
      } else {
        // Different addresses - split 25% each
        feeRulesArray.push({
          fee_asset: kaleSacId,
          recipients: [
            {
              percent: 25_00000n,
              recipient: creatorAddress,
            },
            {
              percent: 25_00000n,
              recipient: userContractId,
            },
          ],
        });
      }
    }

    // Create SmolClient and call coin_them
    const smolClient = new SmolClient({
      contractId: smolContractId,
      rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
      networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
    });

    let at = await smolClient.coin_them({
      user: userContractId,
      asset_bytes: assetBytesArray,
      salts: saltsArray,
      fee_rules: feeRulesArray,
    });

    // Sign the transaction
    const { sequence } = await rpc.getLatestLedger();
    at = await account.sign(at, {
      rpId: getDomain(window.location.hostname) ?? undefined,
      keyId: userKeyId,
      expiration: sequence + 60,
    });

    const xdrString = at.built?.toXDR();

    if (!xdrString) {
      throw new Error('Failed to build signed coin_them transaction');
    }

    console.log('Batch Mint Transaction XDR:', xdrString);
    console.log(
      'Tracks in batch:',
      tracksWithData.map(({ track }) => track.id)
    );

    // Submit to backend
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/mint`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        xdr: xdrString,
        ids: tracksWithData.map(({ track }) => track.id),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to start batch mint workflow');
    }

    // Start polling for all tracks in this batch
    for (const { track } of tracksWithData) {
      const interval = setInterval(
        () => pollTrackMintStatus(track.id, onMinted),
        MINT_POLL_INTERVAL
      );
      mintingState.mintIntervals.set(track.id, interval);

      const timeout = setTimeout(() => {
        clearMintPolling(track.id);
      }, MINT_POLL_TIMEOUT);
      mintingState.mintTimeouts.set(track.id, timeout);

      // Do initial poll
      await pollTrackMintStatus(track.id, onMinted);
    }
  }

  async function mintAllTracks(
    params: MintAllTracksParams,
    mixtape: { tracks: MixtapeTrack[] },
    onMinted: (trackId: string, mintToken: string, mintAmm: string) => void,
    onBatchError: (chunkIndex: number, error: Error) => void
  ): Promise<void> {
    const { mixtapeTracks, userContractId, userKeyId } = params;

    const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
    if (!smolContractId) {
      throw new Error('Missing PUBLIC_SMOL_CONTRACT_ID env var');
    }

    const kaleSacId = import.meta.env.PUBLIC_KALE_SAC_ID;
    if (!kaleSacId) {
      throw new Error('Missing PUBLIC_KALE_SAC_ID env var');
    }

    // Find all tracks that need minting
    const tracksToMintData = mixtapeTracks.filter((track) => {
      return track && !track.Mint_Token && !track.minting;
    });

    if (tracksToMintData.length === 0) return;

    // Get track data for all tracks to mint
    const tracksWithData: Array<{ track: MixtapeTrack; trackData: Smol }> = [];
    for (const trackData of tracksToMintData) {
      const track = mixtape.tracks.find((t) => t.id === trackData.Id);
      if (!track) continue;
      if (!trackData?.Address) {
        console.warn(`No creator address for track ${trackData.Id}`);
        continue;
      }
      tracksWithData.push({ track, trackData });
    }

    if (tracksWithData.length === 0) return;

    // Process in chunks of 5
    const CHUNK_SIZE = 5;
    const chunks: Array<Array<{ track: MixtapeTrack; trackData: Smol }>> = [];

    for (let i = 0; i < tracksWithData.length; i += CHUNK_SIZE) {
      chunks.push(tracksWithData.slice(i, i + CHUNK_SIZE));
    }

    console.log(
      `Processing ${tracksWithData.length} mints in ${chunks.length} batch(es) of up to ${CHUNK_SIZE}`
    );

    // Process each chunk sequentially
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(
        `Processing batch ${chunkIndex + 1}/${chunks.length} with ${chunk.length} track(s)`
      );

      try {
        await mintBatch(
          {
            tracksWithData: chunk,
            smolContractId,
            userContractId,
            userKeyId,
            kaleSacId,
          },
          onMinted
        );
      } catch (error) {
        console.error(`Error processing batch ${chunkIndex + 1}:`, error);
        onBatchError(chunkIndex, error as Error);
      }
    }
  }

  return {
    mintAllTracks,
    clearMintPolling,
    clearAllMintPolling,
    pollTrackMintStatus,
  };
}
