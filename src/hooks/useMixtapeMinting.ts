/**
 * FACTORY FRESH: Mixtape Minting Hook
 * @see https://deepwiki.com/repo/kalepail/smol-fe#minting
 * 
 * Handles batch minting of AI-generated tracks (Smols) onto Stellar/Soroban.
 * Implements "coin_them" multi-minting with sequential chunking to manage 
 * transaction size and resource limits.
 */
import { Asset } from '@stellar/stellar-sdk';
import { Client as SmolClient } from 'smol-sdk';
import { account } from '../utils/passkey-kit';
import { getSafeRpId } from '../utils/domains';
import type { Smol } from '../types/domain';
import type { MixtapeSmolData } from '../services/api/mixtapes';
import { getLatestSequence } from '../utils/base';
import { RPC_URL } from '../utils/rpc';
import { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from '../utils/mint';
import { isUserCancellation } from '../utils/transaction-helpers';

type SignableTransaction = any;

interface MintingState {
  mintIntervals: Map<string, NodeJS.Timeout>;
  mintTimeouts: Map<string, NodeJS.Timeout>;
}

interface MintBatchParams {
  tracksWithData: Array<{ track: MixtapeSmolData; trackData: Smol }>;
  smolContractId: string;
  userContractId: string;
  userKeyId: string;
  kaleSacId: string;
  turnstileToken: string;
}

interface MintAllTracksParams {
  mixtapeTracks: Smol[];
  userContractId: string;
  userKeyId: string;
  turnstileToken: string;
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
    const { tracksWithData, smolContractId, userContractId, userKeyId, kaleSacId, turnstileToken } = params;

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
      const salt = Buffer.from(track.Id.padStart(64, '0'), 'hex');
      if (salt.length !== 32) {
        throw new Error(`Invalid smol identifier for minting: ${track.Id}`);
      }

      const assetCode = track.Id.padStart(64, '0').substring(0, 12);
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
      rpcUrl: RPC_URL,
      networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
    });

    let at = await smolClient.coin_them({
      user: userContractId,
      asset_bytes: assetBytesArray,
      salts: saltsArray,
      fee_rules: feeRulesArray,
    });

    const sequence = await getLatestSequence();
    const signable = at as unknown as SignableTransaction;
    const signed = await (await account.get()).sign(signable, {
      rpId: getSafeRpId(window.location.hostname),
      keyId: userKeyId,
      expiration: sequence + 60,
    });

    const xdrString = signed.built?.toXDR();
    if (signed.built) {
      console.log("Mint Tx Hash:", signed.built.hash().toString('hex'));
    }

    if (!xdrString) {
      throw new Error('Failed to build signed coin_them transaction');
    }


    // Submit to backend with Turnstile token
    // Note: Turnstile token is single-use. Multi-batch minting will fail after the first batch.
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/mint`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Response': turnstileToken,
      },
      body: JSON.stringify({
        xdr: xdrString,
        ids: tracksWithData.map(({ track }) => track.Id),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to start batch mint workflow');
    }

    // Start polling for all tracks in this batch
    for (const { track } of tracksWithData) {
      const interval = setInterval(
        () => pollTrackMintStatus(track.Id, onMinted),
        MINT_POLL_INTERVAL
      );
      mintingState.mintIntervals.set(track.Id, interval);

      const timeout = setTimeout(() => {
        clearMintPolling(track.Id);
      }, MINT_POLL_TIMEOUT);
      mintingState.mintTimeouts.set(track.Id, timeout);

      // Do initial poll
      await pollTrackMintStatus(track.Id, onMinted);
    }
  }

  async function mintAllTracks(
    params: MintAllTracksParams,
    mixtape: { tracks: MixtapeSmolData[] },
    onMinted: (trackId: string, mintToken: string, mintAmm: string) => void,
    onBatchError: (chunkIndex: number, error: Error) => void
  ): Promise<void> {
    const { mixtapeTracks, userContractId, userKeyId, turnstileToken } = params;

    const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID || "CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA";
    if (!smolContractId) {
      throw new Error('Missing PUBLIC_SMOL_CONTRACT_ID env var');
    }

    const kaleSacId = import.meta.env.PUBLIC_KALE_SAC_ID || "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV";

    // Find all tracks that need minting
    const tracksToMintData = mixtapeTracks.filter((track) => {
      return track && !track.Mint_Token;
    });

    if (tracksToMintData.length === 0) return;

    // Get track data for all tracks to mint
    const tracksWithData: Array<{ track: MixtapeSmolData; trackData: Smol }> = [];
    for (const trackData of tracksToMintData) {
      const track = mixtape.tracks.find((t) => t.Id === trackData.Id);
      if (!track) continue;
      if (!trackData?.Address) {
        console.warn(`No creator address for track ${trackData.Id}`);
        continue;
      }
      tracksWithData.push({ track, trackData });
    }

    if (tracksWithData.length === 0) return;

    // FACTORY FRESH: Process in chunks of 5 (Stellar standard)
    const CHUNK_SIZE = 5;
    const chunks: Array<Array<{ track: MixtapeSmolData; trackData: Smol }>> = [];

    for (let i = 0; i < tracksWithData.length; i += CHUNK_SIZE) {
      chunks.push(tracksWithData.slice(i, i + CHUNK_SIZE));
    }

    // Track failed batches for retry
    const failedBatches: Array<{ chunkIndex: number; chunk: typeof chunks[0]; error: Error }> = [];
    const MAX_RETRIES = 1;

    // Process each chunk sequentially - DO NOT throw on error, continue with remaining batches
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];

      try {
        await mintBatch(
          {
            tracksWithData: chunk,
            smolContractId,
            userContractId,
            userKeyId,
            kaleSacId,
            turnstileToken,
          },
          onMinted
        );
      } catch (error) {
        console.error(`Error processing batch ${chunkIndex + 1}/${chunks.length}:`, error);

        // Check if user explicitly cancelled (don't retry cancellations)
        if (isUserCancellation(error)) {
          // User cancelled - report error but CONTINUE with remaining batches
          onBatchError(chunkIndex, error as Error);
          console.log(`User cancelled batch ${chunkIndex + 1}, continuing with remaining batches...`);
        } else {
          // Network/server error - add to retry queue
          failedBatches.push({ chunkIndex, chunk, error: error as Error });
        }
      }
    }

    // Retry failed batches (non-cancellation errors only)
    if (failedBatches.length > 0) {
      console.log(`Retrying ${failedBatches.length} failed batches...`);

      for (const { chunkIndex, chunk, error: originalError } of failedBatches) {
        let retrySuccess = false;

        for (let retry = 0; retry < MAX_RETRIES; retry++) {
          try {
            console.log(`Retry ${retry + 1}/${MAX_RETRIES} for batch ${chunkIndex + 1}...`);

            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 2000));

            await mintBatch(
              {
                tracksWithData: chunk,
                smolContractId,
                userContractId,
                userKeyId,
                kaleSacId,
                turnstileToken,
              },
              onMinted
            );

            retrySuccess = true;
            console.log(`Batch ${chunkIndex + 1} succeeded on retry ${retry + 1}`);
            break;
          } catch (retryError) {
            console.error(`Retry ${retry + 1} failed for batch ${chunkIndex + 1}:`, retryError);
          }
        }

        // Report error if all retries failed
        if (!retrySuccess) {
          onBatchError(chunkIndex, originalError);
        }
      }
    }

    // Log summary
    const totalTracks = tracksWithData.length;
    const successfulTracks = tracksWithData.filter(({ track }) => {
      const found = mixtapeTracks.find(t => t?.Id === track.Id);
      return found?.Mint_Token;
    }).length;

    console.log(`Minting complete: ${successfulTracks}/${totalTracks} tracks minted successfully`);
  }

  return {
    mintAllTracks,
    clearMintPolling,
    clearAllMintPolling,
    pollTrackMintStatus,
  };
}
