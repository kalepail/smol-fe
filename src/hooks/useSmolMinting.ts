import { createMintTransaction, submitMintTransaction, MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from '../utils/mint';

interface MintParams {
  id: string;
  contractId: string;
  keyId: string;
  smolContractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  creatorAddress: string;
  kaleSacId: string;
}

export function useSmolMinting() {
  let mintInterval: NodeJS.Timeout | null = null;
  let mintTimeout: NodeJS.Timeout | null = null;

  function clearMintPolling() {
    if (mintInterval) {
      clearInterval(mintInterval);
      mintInterval = null;
    }
    if (mintTimeout) {
      clearTimeout(mintTimeout);
      mintTimeout = null;
    }
  }

  async function triggerMint(
    params: MintParams,
    onPollStatus: () => Promise<void>
  ): Promise<void> {
    try {
      const xdrString = await createMintTransaction(params);
      await submitMintTransaction(params.id, xdrString, import.meta.env.PUBLIC_API_URL!);

      clearMintPolling();
      mintInterval = setInterval(onPollStatus, MINT_POLL_INTERVAL);
      mintTimeout = setTimeout(() => {
        clearMintPolling();
      }, MINT_POLL_TIMEOUT);

      await onPollStatus();
    } catch (error) {
      console.error(error);
      clearMintPolling();
      throw error;
    }
  }

  return {
    triggerMint,
    clearMintPolling,
  };
}
