/**
 * FACTORY FRESH: Unified Trade Simulation
 * @see https://deepwiki.com/repo/kalepail/smol-fe#trading
 * 
 * Handles market depth simulation via Comet SDK. 
 * Implements strict nonce tracking and debounce to prevent out-of-order 
 * UI updates during rapid input.
 */
import type { Client as CometClient } from 'comet-sdk';

const MAX_PRICE = 170141183460469231731687303715884105727n;

export function useTradeSimulation() {
  let simulationTimer: ReturnType<typeof setTimeout> | null = null;
  let simulationNonce = 0;

  function scheduleSimulation(callback: () => void, delay: number = 1000) {
    if (simulationTimer) {
      clearTimeout(simulationTimer);
    }
    simulationTimer = setTimeout(() => {
      simulationTimer = null;
      callback();
    }, delay);
  }

  async function runSimulation(
    cometClient: CometClient,
    mode: 'buy' | 'sell',
    amount: bigint,
    tokenIn: string,
    tokenOut: string,
    userContractId: string
  ): Promise<{ amountOut: bigint | null; nonce: number }> {
    const localNonce = ++simulationNonce;

    try {
      const tx = await cometClient.swap_exact_amount_in({
        token_in: tokenIn,
        token_amount_in: amount,
        token_out: tokenOut,
        min_amount_out: 0n,
        max_price: MAX_PRICE,
        user: userContractId,
        trade_recipients: undefined,
      });

      if (localNonce !== simulationNonce) {
        return { amountOut: null, nonce: localNonce };
      }

      const [amountOut] = tx.result ?? [];
      return { amountOut: amountOut ?? null, nonce: localNonce };
    } catch (error) {
      console.error('Simulation failed', error);
      throw error;
    }
  }

  function clearTimer() {
    if (simulationTimer) {
      clearTimeout(simulationTimer);
      simulationTimer = null;
    }
  }

  function getCurrentNonce(): number {
    return simulationNonce;
  }

  return {
    scheduleSimulation,
    runSimulation,
    clearTimer,
    getCurrentNonce,
  };
}
