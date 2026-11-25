import type { Client as CometClient } from 'comet-sdk';
import { signWithPasskey } from '../utils/passkeySign';
import { getConnectedAccount } from '../utils/wallet';
import { e2eSeams } from '../utils/collectSeams';

const MAX_PRICE = 170141183460469231731687303715884105727n;

interface SwapParams {
  cometClient: CometClient;
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
  userContractId: string;
  userKeyId: string;
}

export function useTradeExecution() {
  async function executeSwap(params: SwapParams): Promise<bigint | null> {
    const { cometClient, tokenIn, tokenOut, amount, userContractId, userKeyId } = params;
    const seam = e2eSeams()?.swap;
    if (seam) {
      await seam();
      return null;
    }

    const tx = await cometClient.swap_exact_amount_in({
      token_in: tokenIn,
      token_amount_in: amount,
      token_out: tokenOut,
      min_amount_out: 0n,
      max_price: MAX_PRICE,
      user: userContractId,
      trade_recipients: undefined,
    });

    const [expectedOut] = tx.result ?? [];

    await signWithPasskey(tx, { keyId: userKeyId });
    const { send } = await getConnectedAccount();
    await send(tx);

    return expectedOut ?? null;
  }

  return {
    executeSwap,
  };
}
