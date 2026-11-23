import type { Client as CometClient } from 'comet-sdk';
import { rpc } from '../utils/base';
import { getWebAuthnRpId } from '../utils/rpId';
import { getConnectedAccount } from '../utils/wallet';

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

    const { sequence } = await rpc.getLatestLedger();
    const { account, send } = await getConnectedAccount();
    await account.sign(tx, {
      rpId: getWebAuthnRpId(),
      keyId: userKeyId,
      expiration: sequence + 60,
    });

    await send(tx);

    return expectedOut ?? null;
  }

  return {
    executeSwap,
  };
}
