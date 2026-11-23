/**
 * Exact mixtape collect pricing. KALE spent is exact (not an estimate):
 * - `coin_it` transfers exactly 100 KALE per minted song,
 * - `swap_them_in` spends exactly `token_amount_in` (33 KALE) per song bought.
 * What varies is the number of tokens received from a buy, never the KALE in.
 */
export const MINT_COST_KALE = 100;
export const BUY_COST_KALE = 33;
export const MINT_BATCH_SIZE = 5;
export const BUY_BATCH_SIZE = 9;
export const KALE_DECIMALS = 7;
/** Tokens credited to the minter by `coin_it` (10,000,000 with 7 decimals). */
export const MINT_TOKEN_AMOUNT = 10_000_000n * 10n ** 7n;

export const STROOPS_PER_KALE = 10n ** BigInt(KALE_DECIMALS);

export function kaleToStroops(kale: number): bigint {
  return BigInt(Math.max(0, Math.round(kale))) * STROOPS_PER_KALE;
}

export const MINT_COST_STROOPS = kaleToStroops(MINT_COST_KALE);
export const BUY_COST_STROOPS = kaleToStroops(BUY_COST_KALE);
