/**
 * KALE amount formatting. Every function works on exact BigInt stroops (KALE
 * is a SAC with 7 decimals): no `Number()` conversion, so balances above 2^53
 * stroops (~900M KALE) never lose precision.
 */

const GROUP_RE = /\B(?=(\d{3})+(?!\d))/g;

function withCommas(digits: string): string {
  return digits.replace(GROUP_RE, ',');
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** `scaled` / 10^places as "int.frac" with trailing zeros trimmed. */
function fixed(scaled: bigint, places: number, commas = true): string {
  const factor = pow10(places);
  const int = (scaled / factor).toString();
  const intPart = commas ? withCommas(int) : int;
  if (places === 0) return intPart;
  const frac = (scaled % factor).toString().padStart(places, '0').replace(/0+$/, '');
  return frac ? `${intPart}.${frac}` : intPart;
}

/**
 * Exact KALE balance from stroops, e.g. `12_345_678_9000000n` → `"12,345,678.9"`.
 * Thousands are comma-grouped and the fraction keeps every significant digit.
 */
export function formatKaleBalance(balance: bigint, decimals: number = 7): string {
  const negative = balance < 0n;
  const abs = negative ? -balance : balance;
  const text = fixed(abs, decimals);
  return negative ? `-${text}` : text;
}

/** Exact KALE balance with the KALE suffix. */
export function formatKaleBalanceWithSuffix(balance: bigint, decimals: number = 7): string {
  return `${formatKaleBalance(balance, decimals)} KALE`;
}

const COMPACT_SUFFIXES = ['K', 'M', 'B', 'T'] as const;

/**
 * Short KALE balance for tight UI (the header pill). Values are truncated,
 * never rounded up, so the pill never shows more than the wallet holds:
 *
 * - `0` → `"0"`; any non-zero amount below 0.01 → `"<0.01"`
 * - below 1,000 → up to 2 trimmed decimals (`"450"`, `"12.5"`, `"999.99"`)
 * - 1,000 and up → 3 significant digits with K / M / B / T
 *   (`"1K"`, `"1.25K"`, `"12.4K"`, `"999K"`, `"1.2M"`)
 */
export function formatCompactKaleBalance(balance: bigint, decimals: number = 7): string {
  if (balance === 0n) return '0';
  const negative = balance < 0n;
  const abs = negative ? -balance : balance;
  const sign = negative ? '-' : '';
  const unit = pow10(decimals);

  if (abs < 1000n * unit) {
    const cents = (abs * 100n) / unit;
    if (cents === 0n) return `${sign}<0.01`;
    return sign + fixed(cents, 2);
  }

  let tier = 0;
  let divisor = unit * 1000n;
  while (tier < COMPACT_SUFFIXES.length - 1 && abs >= divisor * 1000n) {
    divisor *= 1000n;
    tier++;
  }
  const whole = abs / divisor;
  const places = whole < 10n ? 2 : whole < 100n ? 1 : 0;
  const scaled = (abs * pow10(places)) / divisor;
  return `${sign}${fixed(scaled, places)}${COMPACT_SUFFIXES[tier]}`;
}
