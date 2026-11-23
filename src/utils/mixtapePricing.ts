export const MINT_COST_KALE = 100;
export const PURCHASE_ESTIMATE_KALE = 33;
export const MINT_BATCH_SIZE = 5;
export const PURCHASE_BATCH_SIZE = 9;
export const KALE_DECIMALS = 7;

const STROOPS_PER_KALE = 10n ** BigInt(KALE_DECIMALS);

export function kaleToStroops(kale: number): bigint {
  return BigInt(Math.max(0, Math.round(kale))) * STROOPS_PER_KALE;
}

export function estimateMixtapeCost(mintCount: number, purchaseCount: number) {
  const totalMintCost = mintCount * MINT_COST_KALE;
  const totalPurchaseCost = purchaseCount * PURCHASE_ESTIMATE_KALE;
  const totalCost = totalMintCost + totalPurchaseCost;
  const mintBatches = Math.ceil(mintCount / MINT_BATCH_SIZE);
  const swapBatches = Math.ceil(purchaseCount / PURCHASE_BATCH_SIZE);
  const totalSignatures = mintBatches + swapBatches;
  const estimatedSeconds = totalSignatures * 10;

  return {
    totalMintCost,
    totalPurchaseCost,
    totalCost,
    requiredStroops: kaleToStroops(totalCost),
    mintBatches,
    swapBatches,
    totalSignatures,
    estimatedMinutes: Math.floor(estimatedSeconds / 60),
    remainingSeconds: estimatedSeconds % 60,
  };
}
