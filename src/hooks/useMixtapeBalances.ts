import type { Smol } from '../types/domain';
import { sac } from '../utils/passkey-kit';
import { getTokenBalance } from '../utils/balance';

export function useMixtapeBalances() {
  async function updateTrackBalance(
    trackId: string,
    mintToken: string,
    userContractId: string,
    onBalanceUpdated: (trackId: string, balance: bigint) => void
  ): Promise<void> {
    try {
      const mintTokenClient = sac.getSACClient(mintToken);
      const balance = await getTokenBalance(mintTokenClient, userContractId);
      onBalanceUpdated(trackId, balance);
    } catch (error) {
      console.error(`Error fetching balance for ${trackId}:`, error);
      onBalanceUpdated(trackId, 0n);
    }
  }

  async function refreshAllBalances(
    mixtapeTracks: Smol[],
    userContractId: string,
    onBalanceUpdated: (trackId: string, balance: bigint) => void
  ): Promise<void> {
    console.log('Refreshing all balances...');
    const balanceUpdatePromises = mixtapeTracks.map(async (track) => {
      if (track?.Mint_Token && track?.Mint_Amm) {
        await updateTrackBalance(
          track.Id,
          track.Mint_Token,
          userContractId,
          onBalanceUpdated
        );
      }
    });
    await Promise.all(balanceUpdatePromises);
    console.log('All balances refreshed');
  }

  return {
    updateTrackBalance,
    refreshAllBalances,
  };
}
