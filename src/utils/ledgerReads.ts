/**
 * Pure ledger-read interpretation (no RPC, no env): read results, tri-state
 * balances and the canonical-identity verdict. Imports the SDK only through
 * `ledgerParsers.ts`, so Node unit tests can exercise it directly.
 */
import { isStellarAssetInstance, isSupportedCometInstance, parseBalanceFromLedgerEntry, parseCometRecords } from './ledgerParsers.ts';
import type { xdr } from '@stellar/stellar-sdk/minimal';
import type { CometRecord } from './cometQuote.ts';
import type { ChainFacts } from './mixtapeOwnership.ts';

export type LedgerEntryRead =
  | {
      state: 'found';
      val: xdr.LedgerEntryData;
      lastModifiedLedgerSeq?: number;
      liveUntilLedgerSeq?: number;
      /** Archived persistent entry (RPC ≥ 23 serves the hot archive without a TTL). */
      archived: boolean;
      latestLedger: number;
    }
  /**
   * Absent from the reader. Only evidence of absence when `archiveAware`:
   * an archive-blind (or unverified) reader omits evicted persistent entries.
   */
  | { state: 'missing'; latestLedger: number; archiveAware: boolean }
  | { state: 'error'; error: string };

export interface SmolIdentity {
  id: string;
  padded: string;
  assetCode: string;
  sac: string;
  pool: string;
}

export interface BalanceBatchRequest {
  tokenContractId: string;
  holderAddress: string;
  id?: string;
}

export type BalanceBatchResult = BalanceBatchRequest &
  (
    | {
        status: 'known';
        balance: bigint;
        /** Archived persistent entries still prove a positive balance. */
        liveUntilLedgerSeq?: number;
        archived: boolean;
      }
    /**
     * No balance entry. A known zero only when `archiveAware`; otherwise the
     * entry may be evicted and ownership is unknown.
     */
    | { status: 'missing'; archiveAware: boolean }
    /** Transport or decode failure. Ownership is UNKNOWN, never 0n. */
    | { status: 'error'; error: string }
  );

export function toBalanceResult(req: BalanceBatchRequest, read: LedgerEntryRead | undefined): BalanceBatchResult {
  if (!read) return { ...req, status: 'error', error: 'No read' };
  if (read.state === 'error') return { ...req, status: 'error', error: read.error };
  if (read.state === 'missing') return { ...req, status: 'missing', archiveAware: read.archiveAware };
  try {
    return {
      ...req,
      status: 'known',
      balance: parseBalanceFromLedgerEntry(read.val),
      liveUntilLedgerSeq: read.liveUntilLedgerSeq,
      archived: read.archived,
    };
  } catch {
    return { ...req, status: 'error', error: 'Malformed balance entry' };
  }
}

/** Known balance, or null when unknown (error, or omission on an archive-blind reader). */
export function knownBalance(result: BalanceBatchResult): bigint | null {
  if (result.status === 'known') return result.balance;
  if (result.status === 'missing') return result.archiveAware ? 0n : null;
  return null;
}

export interface IdentityVerdict {
  facts: ChainFacts;
  /** Pool executable is an audited Comet hash (local 50/50 quotes allowed). */
  auditedPool: boolean;
  records?: Map<string, CometRecord>;
  reason?: 'malformed' | 'binding' | 'executable';
}

/**
 * Interpret the three canonical-identity reads for one song.
 * - any read error → `error` (unknown);
 * - pool records that don't bind exactly {canonical SAC, KALE} → `unresolved`;
 * - pool executable not audited → `unresolved` when `requireAuditedPool`;
 * - SAC is a StellarAsset + pool instance + valid records → `minted`;
 * - pool absent → `unminted` ONLY on an archive-aware reader, else `error`.
 */
export function interpretIdentity(
  identity: SmolIdentity,
  reads: { sacInstance?: LedgerEntryRead; poolInstance?: LedgerEntryRead; poolRecords?: LedgerEntryRead },
  opts: { kaleSac: string; requireAuditedPool: boolean }
): IdentityVerdict {
  const { sacInstance, poolInstance, poolRecords } = reads;
  if (!sacInstance || !poolInstance || !poolRecords) return { facts: { status: 'error' }, auditedPool: false };
  if (sacInstance.state === 'error' || poolInstance.state === 'error' || poolRecords.state === 'error') {
    return { facts: { status: 'error' }, auditedPool: false };
  }

  if (poolInstance.state === 'missing' && poolRecords.state === 'missing') {
    // Absent pool ⇒ mintable, but only if the reader would have served an archived pool.
    const aware = poolInstance.archiveAware && poolRecords.archiveAware;
    return { facts: aware ? { status: 'unminted' } : { status: 'error' }, auditedPool: false };
  }
  if (poolInstance.state !== 'found' || poolRecords.state !== 'found' || sacInstance.state !== 'found') {
    return { facts: { status: 'error' }, auditedPool: false }; // inconsistent partial state
  }

  let auditedPool = false;
  let sacIsAsset = false;
  let records: Map<string, CometRecord>;
  try {
    auditedPool = isSupportedCometInstance(poolInstance.val);
    sacIsAsset = isStellarAssetInstance(sacInstance.val);
    records = parseCometRecords(poolRecords.val);
  } catch {
    return { facts: { status: 'error' }, auditedPool: false, reason: 'malformed' };
  }
  const kaleRecord = records.get(opts.kaleSac);
  if (!sacIsAsset || records.size !== 2 || !records.has(identity.sac) || !kaleRecord) {
    return { facts: { status: 'unresolved' }, auditedPool, reason: 'binding' };
  }
  if (opts.requireAuditedPool && !auditedPool) {
    return { facts: { status: 'unresolved' }, auditedPool, reason: 'executable' };
  }
  return {
    facts: { status: 'minted', sac: identity.sac, pool: identity.pool, kaleReserve: kaleRecord.balance },
    auditedPool,
    records,
  };
}
