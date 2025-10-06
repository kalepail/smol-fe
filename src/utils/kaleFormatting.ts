/**
 * Format a KALE balance from stroop units to a human-readable string
 * Assumes 7 decimals for KALE token
 */
export function formatKaleBalance(balance: bigint, decimals: number = 7): string {
  const raw = Number(balance) / Math.pow(10, decimals);
  const [int, dec] = raw.toFixed(decimals).split('.');
  const intWithCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (Number(dec) > 0) {
    const trimmedDec = dec.replace(/0+$/, '');
    return `${intWithCommas}.${trimmedDec}`;
  }

  return intWithCommas;
}

/**
 * Format KALE balance with the KALE suffix
 */
export function formatKaleBalanceWithSuffix(balance: bigint, decimals: number = 7): string {
  return `${formatKaleBalance(balance, decimals)} KALE`;
}
