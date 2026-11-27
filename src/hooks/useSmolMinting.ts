import { MINT_POLL_TIMEOUT } from '../utils/mintConstants';
import { combineAbortSignals } from '../utils/pollLoop';
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
  async function triggerMint(
    params: MintParams,
    signal: AbortSignal,
    onSubmitted: () => void
  ): Promise<void> {
    const [{ createMintTransaction, submitMintTransaction }, { pollMintSettlement }] = await Promise.all([
      import('../utils/mint'),
      import('./useMixtapeMinting'),
    ]);
    signal.throwIfAborted();
    const xdr = await createMintTransaction(params);
    signal.throwIfAborted();
    const { workflowId } = await submitMintTransaction(params.id, xdr, import.meta.env.PUBLIC_API_URL!, params.session);
    signal.throwIfAborted();
    onSubmitted();

    const deadline = Date.now() + MINT_POLL_TIMEOUT;
    const timeout = AbortSignal.timeout(MINT_POLL_TIMEOUT);
    let failed = false;
    try {
      const { remaining } = await pollMintSettlement({
        ids: [params.id],
        holder: params.session.contractId,
        targets: workflowId ? [{ trackIds: [params.id], workflowIds: [workflowId] }] : [],
        chainOnlyIds: workflowId ? [] : [params.id],
        signal: combineAbortSignals(signal, timeout),
        deadline,
        onSettled: () => {},
        onFailed: () => { failed = true; },
      });
      if (remaining.length === 0 && !failed) return;
    } catch (error) {
      if (!timeout.aborted || signal.aborted) throw error;
    }

    if (failed) throw new Error('The mint failed to confirm on Stellar. You can try again.');
    throw new Error('The mint is taking longer than expected. Refresh this page to check its status.');
  }

  return { triggerMint };
}
