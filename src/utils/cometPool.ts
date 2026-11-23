/**
 * Song-pool trade snapshot — LAZY-LOADED (Stellar SDK via batchLedgerEntries).
 *
 * One `getLedgerEntries` call returns everything the trade sheet displays:
 * pool instance (fee config), pool reserves (`AllRecordData`), the user's KALE
 * and song-token balances. Quotes are computed locally with exact bigint math
 * (`cometQuote.ts`); `simulateTransaction` is kept only for building the swap
 * transaction that gets signed.
 */
import {
  createCometRecordsLedgerKey,
  createContractInstanceLedgerKey,
  createSACBalanceLedgerKey,
  knownBalance,
  parseCometFeeConfig,
  parseCometRecords,
  readLedgerEntries,
  toBalanceResult,
} from './batchLedgerEntries';
import {
  CometQuoteError,
  cometDynamicFee,
  quoteExactIn,
  type CometFeeConfig,
  type CometRecord,
} from './cometQuote';
import { logger } from './logger';

export interface CometTradeSnapshot {
  mintToken: string;
  kaleRecord: CometRecord;
  mintRecord: CometRecord;
  feeConfig: (CometFeeConfig & { trackedToken: string }) | null;
  /** null = not requested (signed out). Errors throw. */
  userKale: bigint | null;
  userMint: bigint | null;
  latestLedger: number | null;
}

export async function readCometTradeSnapshot(input: {
  pool: string;
  mintToken: string;
  holder?: string | null;
}): Promise<CometTradeSnapshot> {
  const kaleSac = import.meta.env.PUBLIC_KALE_SAC_ID;
  const instanceKey = createContractInstanceLedgerKey(input.pool);
  const recordsKey = createCometRecordsLedgerKey(input.pool);
  const kaleKey = input.holder ? createSACBalanceLedgerKey(kaleSac, input.holder) : null;
  const mintKey = input.holder ? createSACBalanceLedgerKey(input.mintToken, input.holder) : null;
  const keys = [instanceKey, recordsKey, ...(kaleKey ? [kaleKey] : []), ...(mintKey ? [mintKey] : [])];

  const reads = await readLedgerEntries(keys);
  const records = reads.get(recordsKey);
  if (!records || records.state !== 'found') {
    throw new Error(records?.state === 'missing' ? 'This song has no market yet.' : "Couldn't load the market.");
  }
  const byToken = parseCometRecords(records.val);
  const kaleRecord = byToken.get(kaleSac);
  const mintRecord = byToken.get(input.mintToken);
  if (!kaleRecord || !mintRecord) throw new Error("This market doesn't match this song.");

  let feeConfig: CometTradeSnapshot['feeConfig'] = null;
  const instance = reads.get(instanceKey);
  if (instance?.state === 'found') {
    try {
      feeConfig = parseCometFeeConfig(instance.val);
    } catch (error) {
      logger.warn('trade', 'Unreadable pool fee config; quotes fall back to simulation', error);
    }
  }

  const balanceOf = (key: string | null, token: string): bigint | null => {
    if (!key || !input.holder) return null;
    const value = knownBalance(toBalanceResult({ tokenContractId: token, holderAddress: input.holder }, reads.get(key)));
    if (value === null) throw new Error("Couldn't load your balances.");
    return value;
  };

  return {
    mintToken: input.mintToken,
    kaleRecord,
    mintRecord,
    feeConfig,
    userKale: balanceOf(kaleKey, kaleSac),
    userMint: balanceOf(mintKey, input.mintToken),
    latestLedger: records.latestLedger,
  };
}

/**
 * Exact local quote. Returns null when the pool shape or fee config isn't the
 * verified 50/50 version (caller falls back to a simulation); throws a
 * `CometQuoteError` for out-of-range input.
 */
export function quoteTrade(
  snapshot: CometTradeSnapshot,
  mode: 'buy' | 'sell',
  amountIn: bigint
): bigint | null {
  const kaleSac = import.meta.env.PUBLIC_KALE_SAC_ID;
  const cfg = snapshot.feeConfig;
  if (!cfg) return null;
  const tracked =
    cfg.trackedToken === kaleSac
      ? snapshot.kaleRecord
      : cfg.trackedToken === snapshot.mintToken
        ? snapshot.mintRecord
        : null;
  if (!tracked) return null;
  const fee = cometDynamicFee(tracked.balance, cfg);
  const [inRecord, outRecord] =
    mode === 'buy' ? [snapshot.kaleRecord, snapshot.mintRecord] : [snapshot.mintRecord, snapshot.kaleRecord];
  try {
    return quoteExactIn({ amountIn, inRecord, outRecord, fee }).amountOut;
  } catch (error) {
    if (error instanceof CometQuoteError && error.issue === 'unsupported') return null;
    throw error;
  }
}
