import { Errors as CometErrors, type Client as CometClient } from 'comet-sdk';
import { expectSimulatedTuple } from '../utils/contractResult';
import { signWithPasskey } from '../utils/passkeySign';
import {
  assertWalletAction,
  assertWalletActionUnsent,
  getConnectedAccount,
  walletDispatchGuard,
  type WalletActionTicket,
} from '../utils/wallet';
import { e2eSeams } from '../utils/collectSeams';
import { isSlippageError, minAmountOutFor, SlippageExceededError } from '../utils/slippage';

const MAX_PRICE = 170141183460469231731687303715884105727n;

interface SwapParams {
  cometClient: CometClient;
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
  /** The quote the user reviewed for exactly this `amount` (exact-in output). */
  quotedAmountOut: bigint;
  /**
   * The session the user submitted under (captured at click). The swap is
   * built for, signed by and relayed from exactly this wallet; if the session
   * changes first, it aborts with `WalletActionSupersededError`.
   */
  session: WalletActionTicket;
}

export function useTradeExecution() {
  async function executeSwap(params: SwapParams): Promise<bigint | null> {
    const { cometClient, tokenIn, tokenOut, amount, quotedAmountOut, session } = params;
    if (quotedAmountOut <= 0n) throw new Error('Get a quote before trading.');
    // On-chain floor: the pool rejects (ErrLimitOut) anything worse than 1% under the quote.
    const minAmountOut = minAmountOutFor(quotedAmountOut);

    try {
      assertWalletAction(session); // before building
      const seam = e2eSeams()?.swap;
      if (seam) {
        await seam({ tokenIn, tokenOut, amount, quotedAmountOut, minAmountOut });
        return null;
      }

      // Building simulates against the live pool. If the price already moved
      // past the floor, the SDK does NOT throw: the simulation carries
      // `Error(Contract, #20|#23)` and `tx.result` is an `Err`. Read the
      // simulation first so the contract code reaches the re-quote path
      // (`ContractCallError` → `SlippageExceededError`) before any prompt.
      const tx = await cometClient.swap_exact_amount_in({
        token_in: tokenIn,
        token_amount_in: amount,
        token_out: tokenOut,
        min_amount_out: minAmountOut,
        max_price: MAX_PRICE,
        user: session.contractId,
        trade_recipients: undefined,
      });

      const [expectedOut] = expectSimulatedTuple<readonly [bigint, bigint]>(tx, CometErrors);

      const wallet = await getConnectedAccount(session);
      await signWithPasskey(tx, { keyId: session.keyId, wallet, session }); // asserts before the prompt
      assertWalletActionUnsent(session); // before Turnstile + relay
      // …and again AFTER Turnstile, in the same tick as the relayer POST.
      await wallet.send(tx, { beforeDispatch: walletDispatchGuard(session) });

      return expectedOut ?? null;
    } catch (error) {
      if (isSlippageError(error)) throw new SlippageExceededError(minAmountOut, { cause: error });
      throw error;
    }
  }

  return {
    executeSwap,
  };
}
