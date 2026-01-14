import { Client as SmolClient } from 'smol-sdk';
import { getDomain } from 'tldts';
import type { Smol } from '../types/domain';
import { getLatestSequence } from '../utils/base';
import { account, send } from '../utils/passkey-kit';
import { RPC_URL } from '../utils/rpc';

interface PurchaseBatchParams {
  tokensOut: string[];
  cometAddresses: string[];
  smolContractId: string;
  userContractId: string;
  userKeyId: string;
}

export function useMixtapePurchase() {
  async function purchaseBatch(params: PurchaseBatchParams): Promise<void> {
    const { tokensOut, cometAddresses, smolContractId, userContractId, userKeyId } = params;

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

    const sequence = await getLatestSequence();
    await account.get().sign(tx, {
      rpId: getDomain(window.location.hostname) ?? undefined,
      keyId: userKeyId,
      expiration: sequence + 60,
    });

    // Log the XDR for inspection
    const xdrString = tx.built?.toXDR();


    // Submit transaction via passkey server
    await send(tx);
  }

  async function purchaseTracksInBatches(
    mixtapeTracks: Smol[],
    tokensOut: string[],
    smolContractId: string,
    userContractId: string,
    userKeyId: string,
    onBatchComplete: (trackIds: string[]) => void
  ): Promise<void> {
    const BATCH_SIZE = 9;

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

    const chunks: Array<typeof tokenData> = [];
    for (let i = 0; i < tokenData.length; i += BATCH_SIZE) {
      chunks.push(tokenData.slice(i, i + BATCH_SIZE));
    }


    // Process each chunk sequentially
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];


      try {
        const tokensOutChunk = chunk.map((d) => d.token);
        const cometAddressesChunk = chunk.map((d) => d.comet);

        await purchaseBatch({
          tokensOut: tokensOutChunk,
          cometAddresses: cometAddressesChunk,
          smolContractId,
          userContractId,
          userKeyId,
        });

        // Mark substeps as complete
        const trackIds = chunk.map((data) => data.trackId);
        onBatchComplete(trackIds);
      } catch (error) {
        console.error(
          `Error processing purchase batch ${chunkIndex + 1}:`,
          error
        );
        throw error;
      }
    }
  }

  return {
    purchaseTracksInBatches,
  };
}
