import { logger } from '../utils/logger';
import { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from '../utils/mintConstants';

import type { SessionTicket } from '../stores/user.svelte';

interface MintParams {
  id: string;
  /** The session the user clicked Mint under (see `createMintTransaction`). */
  session: SessionTicket;
  smolContractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  creatorAddress: string;
  kaleSacId: string;
}

export function useSmolMinting() {
  let mintInterval: ReturnType<typeof setInterval> | null = null;
  let mintTimeout: ReturnType<typeof setTimeout> | null = null;

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
      const { createMintTransaction, submitMintTransaction } = await import('../utils/mint');
      const xdrString = await createMintTransaction(params);
      await submitMintTransaction(params.id, xdrString, import.meta.env.PUBLIC_API_URL!, params.session);

      clearMintPolling();
      mintInterval = setInterval(onPollStatus, MINT_POLL_INTERVAL);
      mintTimeout = setTimeout(() => {
        clearMintPolling();
      }, MINT_POLL_TIMEOUT);

      await onPollStatus();
    } catch (error) {
      logger.error('mint', error);
      clearMintPolling();
      throw error;
    }
  }

  return {
    triggerMint,
    clearMintPolling,
  };
}
