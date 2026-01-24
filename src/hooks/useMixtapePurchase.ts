import { Client as SmolClient } from 'smol-sdk';
import type { Smol } from '../types/domain';
import { RPC_URL } from '../utils/rpc';
import {
  signSendAndVerify,
  type GetFreshTokenCallback,
  type SignAndSendResult,
} from '../utils/transaction-helpers';
import { account } from '../utils/passkey-kit';

type SignableTransaction = Parameters<ReturnType<typeof account.get>['sign']>[0];

interface PurchaseBatchParams {
  tokensOut: string[];
  cometAddresses: string[];
  smolContractId: string;
  userContractId: string;
  userKeyId: string;
  turnstileToken: string;
}

export function useMixtapePurchase() {
  /**
   * Purchase a batch of tokens with timeout recovery
   *
   * Uses unified signSendAndVerify helper which automatically:
   * - Signs the transaction
   * - Submits to relayer
   * - Verifies on network
   * - Recovers from timeouts by polling network directly
   */
  async function purchaseBatch(params: PurchaseBatchParams): Promise<SignAndSendResult> {
    const { tokensOut, cometAddresses, smolContractId, userContractId, userKeyId, turnstileToken } = params;

    const costPerToken = 33_0000000n; // 33 KALE per token

    // Create the swap_them_in transaction
    const smolClient = new SmolClient({
      contractId: smolContractId,
      rpcUrl: RPC_URL,
      networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
    });

    const tx = await smolClient.swap_them_in({
      user: userContractId,
      comet_addresses: cometAddresses,
      tokens_out: tokensOut,
      token_amount_in: costPerToken,
      fee_recipients: undefined,
    });

    // Sign, send, and verify with automatic timeout recovery
    return await signSendAndVerify(tx, {
      keyId: userKeyId,
      turnstileToken,
      // Don't use lock - batches are sequential already
      useLock: false,
    });
  }

  /**
   * Purchase tracks in batches of 3 with automatic Turnstile token refresh
   *
   * Uses processChunksWithRetry for consistent batch processing
   */
  async function purchaseTracksInBatches(
    mixtapeTracks: Smol[],
    tokensOut: string[],
    smolContractId: string,
    userContractId: string,
    userKeyId: string,
    turnstileToken: string,
    onBatchComplete: (trackIds: string[]) => void,
    getFreshToken?: GetFreshTokenCallback
  ): Promise<void> {
    const BATCH_SIZE = 3;

    // Build arrays of tokens and their corresponding comet addresses
    const tokenData: Array<{
      token: string;
      comet: string;
      trackId: string;
    }> = [];

    for (const track of mixtapeTracks) {
      if (
        track?.Mint_Token &&
        track?.Mint_Amm &&
        tokensOut.includes(track.Mint_Token)
      ) {
        tokenData.push({
          token: track.Mint_Token,
          comet: track.Mint_Amm,
          trackId: track.Id,
        });
      }
    }

    // Create chunks
    const chunks: Array<typeof tokenData> = [];
    for (let i = 0; i < tokenData.length; i += BATCH_SIZE) {
      chunks.push(tokenData.slice(i, i + BATCH_SIZE));
    }

    // Process each chunk sequentially
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      let currentToken = turnstileToken;

      // Get fresh token for subsequent batches
      if (chunkIndex > 0 && getFreshToken) {
        try {
          currentToken = await getFreshToken();
        } catch (e) {
          console.error("Failed to get fresh Turnstile token for batch", chunkIndex + 1);
          throw new Error("Verification failed for batch " + (chunkIndex + 1));
        }
      }

      try {
        const tokensOutChunk = chunk.map((d) => d.token);
        const cometAddressesChunk = chunk.map((d) => d.comet);

        const result = await purchaseBatch({
          tokensOut: tokensOutChunk,
          cometAddresses: cometAddressesChunk,
          smolContractId,
          userContractId,
          userKeyId,
          turnstileToken: currentToken,
        });

        if (!result.success) {
          throw new Error(result.error || 'Purchase batch failed');
        }

        // Mark substeps as complete
        const trackIds = chunk.map((data) => data.trackId);
        onBatchComplete(trackIds);

      } catch (error) {
        console.error(`Error processing purchase batch ${chunkIndex + 1}:`, error);
        throw error;
      }
    }
  }

  return {
    purchaseTracksInBatches,
  };
}
