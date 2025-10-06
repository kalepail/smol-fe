const BUY_CAP_NUMERATOR = 3333334n;
const BUY_CAP_DENOMINATOR = 10000000n;

export function computeAmmBuyCap(ammKaleBalance: bigint): bigint {
  if (ammKaleBalance <= 0n) return 0n;
  return (ammKaleBalance * BUY_CAP_NUMERATOR) / BUY_CAP_DENOMINATOR;
}

export function computeMaxBuy(ammKaleBalance: bigint, userKaleBalance: bigint): bigint {
  if (ammKaleBalance <= 0n) return 0n;
  const cap = computeAmmBuyCap(ammKaleBalance);
  if (userKaleBalance <= 0n) {
    return 0n;
  }
  return userKaleBalance < cap ? userKaleBalance : cap;
}

export function formatAmount(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = BigInt(decimals);
  if (scale === 0n) {
    return `${negative ? '-' : ''}${absolute.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
  const divider = 10n ** scale;
  const integerPart = absolute / divider;
  const fractionPart = absolute % divider;
  let fraction = fractionPart.toString().padStart(decimals, '0');
  fraction = fraction.replace(/0+$/, '');
  const integerWithCommas = integerPart
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${integerWithCommas}${fraction ? `.${fraction}` : ''}`;
}

export function parseInputToUnits(value: string, decimals: number): bigint | null {
  const sanitized = value.replace(/,/g, '').trim();
  if (!sanitized) return null;
  if (!/^\d*(?:\.\d*)?$/.test(sanitized)) return null;
  const [wholePart = '', fractionPart = ''] = sanitized.split('.');
  if (!wholePart && !fractionPart) return null;
  if (fractionPart.length > decimals) return null;
  const paddedFraction = (fractionPart + '0'.repeat(decimals)).slice(0, decimals);
  const combined = `${wholePart || '0'}${paddedFraction}`.replace(/^0+(\d)/, '$1');
  return BigInt(combined || '0');
}
