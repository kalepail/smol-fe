/**
 * E2E-only substitutes for the collect flow's EXTERNAL boundaries: transaction
 * assembly, the passkey prompt, the relay / POST /mint, and the optional
 * server snapshot. Production code paths (ordering, guards, persistence) still
 * run. Compiled out of every build that doesn't set PUBLIC_E2E_SEAMS=1, which
 * only the Playwright dev server does.
 */
export interface BoundarySeam {
  assemble?: () => Promise<unknown>;
  /**
   * Buy batches only: stands in for the aggregate local quote (song tokens out
   * for the whole batch). Called once at approval and once right before signing.
   */
  quote?: (phase: 'baseline' | 'requote') => Promise<bigint | null>;
  expiration?: () => Promise<number>;
  /**
   * Buy batches only: stands in for restoring the passkey wallet, which happens
   * BEFORE the final re-quote (so a price move during a slow restore is caught).
   */
  prepareWallet?: () => Promise<void>;
  sign?: () => Promise<void>;
  relay?: (trackIds: string[]) => Promise<unknown>;
}

export interface SwapSeamArgs {
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
  quotedAmountOut: bigint;
  minAmountOut: bigint;
}

export interface CollectSeams {
  buy?: BoundarySeam;
  mint?: BoundarySeam;
  /** Use POST /chain/snapshot as if PUBLIC_CHAIN_SNAPSHOT=1. */
  serverSnapshot?: boolean;
  /** Use POST /mint/status as if PUBLIC_MINT_STATUS=1. */
  mintStatus?: boolean;
  /** Header KALE auto-load defer (ms), to hold the pending timer open in tests. */
  balanceDeferMs?: number;
  /**
   * Stands in for the whole trade swap (build, passkey, send) in MintTradeModal.
   * Receives the exact limits the real swap would carry; a throw is mapped
   * through the same slippage classifier as a real contract error.
   */
  swap?: (args: SwapSeamArgs) => Promise<unknown>;
}

export function e2eSeams(): CollectSeams | undefined {
  if (import.meta.env.PUBLIC_E2E_SEAMS !== '1') return undefined;
  return (globalThis as { __smolCollectSeams?: CollectSeams }).__smolCollectSeams;
}
