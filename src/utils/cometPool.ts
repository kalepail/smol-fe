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
  createSACBalanceLedgerKey,
  knownBalance,
  parseCometFeeConfig,
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
import { deriveSmolIdentity, identityKeys, interpretIdentity } from './smolChainIdentity';

export class TradeMarketError extends Error {
  readonly reason: 'unresolved' | 'unminted' | 'unavailable' | 'balances';
  constructor(reason: TradeMarketError['reason'], message: string) {
    super(message);
    this.name = 'TradeMarketError';
    this.reason = reason;
  }
}

export interface CometTradeSnapshot {
  /** Canonical, verified market for THIS song (never taken from D1 alone). */
  pool: string;
  mintToken: string;
  /** D1 pointed at a different pair (cross-wired) or had none (unindexed). */
  d1Mismatch: boolean;
  unindexed: boolean;
  kaleRecord: CometRecord;
  mintRecord: CometRecord;
  /**
   * Pool executable is the audited Comet hash. When false the sheet shows
   * "Unsupported pool contract version" and never quotes or executes a swap.
   */
  auditedPool: boolean;
  /** null when the fee config is unreadable: quotes fall back to simulation. */
  feeConfig: (CometFeeConfig & { trackedToken: string }) | null;
  /** null = not requested (signed out). Errors throw. */
  userKale: bigint | null;
  userMint: bigint | null;
  latestLedger: number | null;
}

/**
 * Resolve and verify the song's canonical (SAC, pool) pair and read everything
 * the trade sheet shows in ONE getLedgerEntries call: SAC instance, pool
 * instance (executable + fee config), pool reserves, user KALE, user tokens.
 * Throws `TradeMarketError` when the market can't be verified — trading is
 * then blocked rather than pointed at whatever D1 says.
 */
export async function readCometTradeSnapshot(input: {
  songId: string;
  d1Token?: string | null;
  d1Amm?: string | null;
  holder?: string | null;
}): Promise<CometTradeSnapshot> {
  const kaleSac = import.meta.env.PUBLIC_KALE_SAC_ID;
  const identity = deriveSmolIdentity(input.songId);
  if (!identity) {
    throw new TradeMarketError('unresolved', "We couldn't verify this song's market, so trading is paused.");
  }
  const keys = identityKeys(identity);
  const kaleKey = input.holder ? createSACBalanceLedgerKey(kaleSac, input.holder) : null;
  const mintKey = input.holder ? createSACBalanceLedgerKey(identity.sac, input.holder) : null;
  const reads = await readLedgerEntries([
    keys.sacInstance,
    keys.poolInstance,
    keys.poolRecords,
    ...(kaleKey ? [kaleKey] : []),
    ...(mintKey ? [mintKey] : []),
  ]);

  const verdict = interpretIdentity(
    identity,
    {
      sacInstance: reads.get(keys.sacInstance),
      poolInstance: reads.get(keys.poolInstance),
      poolRecords: reads.get(keys.poolRecords),
    },
    { kaleSac, requireAuditedPool: false }
  );
  if (verdict.facts.status === 'unminted') {
    throw new TradeMarketError('unminted', "This song isn't minted yet, so it has no market.");
  }
  if (verdict.facts.status === 'unresolved') {
    throw new TradeMarketError('unresolved', "We couldn't verify this song's market, so trading is paused.");
  }
  if (verdict.facts.status !== 'minted' || !verdict.records) {
    throw new TradeMarketError('unavailable', "Couldn't load the market. Try again in a moment.");
  }
  const kaleRecord = verdict.records.get(kaleSac)!;
  const mintRecord = verdict.records.get(identity.sac)!;
  const d1Mismatch = Boolean(
    (input.d1Token && input.d1Token !== identity.sac) || (input.d1Amm && input.d1Amm !== identity.pool)
  );
  if (d1Mismatch) logger.warn('trade', `D1 market for ${input.songId} differs from the canonical pair; using canonical`);

  let feeConfig: CometTradeSnapshot['feeConfig'] = null;
  const instance = reads.get(keys.poolInstance);
  if (verdict.auditedPool && instance?.state === 'found') {
    try {
      feeConfig = parseCometFeeConfig(instance.val);
    } catch (error) {
      logger.warn('trade', 'Unreadable pool fee config; quotes fall back to simulation', error);
    }
  }

  const balanceOf = (key: string | null, token: string): bigint | null => {
    if (!key || !input.holder) return null;
    const value = knownBalance(toBalanceResult({ tokenContractId: token, holderAddress: input.holder }, reads.get(key)));
    if (value === null) throw new TradeMarketError('balances', "Couldn't load your balances.");
    return value;
  };

  const recordsRead = reads.get(keys.poolRecords);
  return {
    pool: identity.pool,
    mintToken: identity.sac,
    d1Mismatch,
    unindexed: !input.d1Token && !input.d1Amm,
    auditedPool: verdict.auditedPool,
    kaleRecord,
    mintRecord,
    feeConfig,
    userKale: balanceOf(kaleKey, kaleSac),
    userMint: balanceOf(mintKey, identity.sac),
    latestLedger: recordsRead && recordsRead.state !== 'error' ? recordsRead.latestLedger : null,
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
