import type { Smol } from '../types/domain';
import { getBatchSACBalances } from '../utils/batchLedgerEntries';

export function useMixtapeBalances() {
  /**
   * Update a single track balance
   * For individual updates (e.g., after minting)
   */
  async function updateTrackBalance(
    trackId: string,
    mintToken: string,
    userContractId: string,
    onBalanceUpdated: (trackId: string, balance: bigint) => void
  ): Promise<void> {
    try {
      // Use the batch function even for single requests
      const results = await getBatchSACBalances([
        {
          tokenContractId: mintToken,
          holderAddress: userContractId,
          id: trackId,
        },
      ]);

      if (results.length > 0 && results[0].id) {
        onBalanceUpdated(results[0].id, results[0].balance);
      }
    } catch (error) {
      console.error(`Error fetching balance for ${trackId}:`, error);
      onBalanceUpdated(trackId, 0n);
    }
  }

  /**
   * Refresh all track balances using batched RPC calls
   * This is much more efficient than individual calls per track
   */
  async function refreshAllBalances(
    mixtapeTracks: Smol[],
    userContractId: string,
    onBalanceUpdated: (trackId: string, balance: bigint) => void
  ): Promise<void> {


    // Filter tracks that have mint tokens and build batch requests
    const batchRequests = mixtapeTracks
      .filter((track) => track?.Mint_Token && track?.Mint_Amm)
      .map((track) => ({
        tokenContractId: track.Mint_Token!,
        holderAddress: userContractId,
        id: track.Id, // Use track ID to map results back
      }));

    if (batchRequests.length === 0) {

      return;
    }



    try {
      // Make batched RPC call(s) - automatically handles chunking if > 200
      const results = await getBatchSACBalances(batchRequests);

      // Update each balance via the callback
      for (const result of results) {
        if (result.id) {
          onBalanceUpdated(result.id, result.balance);
        }
      }


    } catch (error) {
      console.error('Error refreshing balances:', error);
      // Set all balances to 0 on error
      for (const request of batchRequests) {
        if (request.id) {
          onBalanceUpdated(request.id, 0n);
        }
      }
    }
  }

  return {
    updateTrackBalance,
    refreshAllBalances,
  };
}
