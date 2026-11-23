/**
 * Batched, coalesced Stellar `getLedgerEntries` reader (LAZY-LOADED: imports the
 * Stellar SDK; never import this statically from a route component).
 *
 * Contract (fixes C-02 at the source):
 * - Every key resolves to `found | missing | error`. A transport or decode
 *   failure is `error` and NEVER a fabricated `0n` balance.
 * - Results are keyed by the canonical base64 LedgerKey, never by array
 *   position (RPC omits missing entries and may reorder).
 * - Arbitrary key kinds share ONE call: SAC balances, KALE balance, SAC
 *   instances and Comet `AllRecordData` maps for a whole mixtape.
 * - In-flight coalescing is per canonical key; each caller gets its own
 *   ordering and ids back. Keys requested in the same microtask are batched.
 */
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk/minimal';
import { rpc } from './base';
import { logger } from './logger';
import type { CometFeeConfig, CometRecord } from './cometQuote';

export const MAX_LEDGER_KEYS_PER_CALL = 200;

export type LedgerEntryRead =
  | {
      state: 'found';
      val: xdr.LedgerEntryData;
      lastModifiedLedgerSeq?: number;
      liveUntilLedgerSeq?: number;
      latestLedger: number;
    }
  | { state: 'missing'; latestLedger: number }
  | { state: 'error'; error: string };

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

function contractDataKey(contractId: string, key: xdr.ScVal): string {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    })
  ).toXDR('base64');
}

export function createSACBalanceLedgerKey(tokenContractId: string, holderAddress: string): string {
  return contractDataKey(
    tokenContractId,
    xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), new Address(holderAddress).toScVal()])
  );
}

export function createContractInstanceLedgerKey(contractId: string): string {
  return contractDataKey(contractId, xdr.ScVal.scvLedgerKeyContractInstance());
}

/** Comet reserve map: persistent `["AllRecordData"]` → Map<address, record>. */
export function createCometRecordsLedgerKey(poolId: string): string {
  return contractDataKey(poolId, xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('AllRecordData')]));
}

// ---------------------------------------------------------------------------
// Coalesced reader
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<LedgerEntryRead>>();
let pending: Map<string, (read: LedgerEntryRead) => void> | null = null;

function canonical(key: string): string {
  return xdr.LedgerKey.fromXDR(key, 'base64').toXDR('base64');
}

async function fetchChunk(keys: string[], resolvers: Map<string, (r: LedgerEntryRead) => void>) {
  try {
    const response = await rpc.getLedgerEntries(...keys.map((k) => xdr.LedgerKey.fromXDR(k, 'base64')));
    const latestLedger = response.latestLedger;
    const byKey = new Map<string, (typeof response.entries)[number]>();
    for (const entry of response.entries ?? []) {
      if (entry?.key) byKey.set(entry.key.toXDR('base64'), entry);
    }
    for (const key of keys) {
      const entry = byKey.get(key);
      resolvers.get(key)?.(
        entry?.val
          ? {
              state: 'found',
              val: entry.val,
              lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq,
              liveUntilLedgerSeq: entry.liveUntilLedgerSeq,
              latestLedger,
            }
          : { state: 'missing', latestLedger }
      );
    }
  } catch (error) {
    logger.error('rpc', 'getLedgerEntries failed:', error);
    const message = error instanceof Error ? error.message : 'Ledger read failed';
    for (const key of keys) resolvers.get(key)?.({ state: 'error', error: message });
  }
}

function flush() {
  const batch = pending;
  pending = null;
  if (!batch || batch.size === 0) return;
  const keys = [...batch.keys()];
  for (let i = 0; i < keys.length; i += MAX_LEDGER_KEYS_PER_CALL) {
    void fetchChunk(keys.slice(i, i + MAX_LEDGER_KEYS_PER_CALL), batch);
  }
}

function readOne(key: string): Promise<LedgerEntryRead> {
  const existing = inflight.get(key);
  if (existing) return existing;
  if (!pending) {
    pending = new Map();
    queueMicrotask(flush);
  }
  const batch = pending;
  const promise = new Promise<LedgerEntryRead>((resolve) => {
    batch.set(key, resolve);
  }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/**
 * Read any set of ledger keys (base64 XDR). Keys requested together (or by
 * concurrent callers in the same tick) go out in ⌈unique/200⌉ calls.
 */
export async function readLedgerEntries(keys: string[]): Promise<Map<string, LedgerEntryRead>> {
  const out = new Map<string, LedgerEntryRead>();
  const unique = new Map<string, string>();
  for (const key of keys) {
    try {
      unique.set(key, canonical(key));
    } catch (error) {
      out.set(key, { state: 'error', error: error instanceof Error ? error.message : 'Invalid key' });
    }
  }
  const reads = await Promise.all([...unique].map(async ([raw, key]) => [raw, await readOne(key)] as const));
  for (const [raw, read] of reads) out.set(raw, read);
  return out;
}

// ---------------------------------------------------------------------------
// Parsers (throw on malformed data — callers map a throw to `error`)
// ---------------------------------------------------------------------------

function contractDataVal(entry: xdr.LedgerEntryData): xdr.ScVal {
  if (entry.switch().value !== xdr.LedgerEntryType.contractData().value) {
    throw new TypeError('Not a contract data entry');
  }
  return entry.contractData().val();
}

/** SAC balance for a C-address holder: ScMap { amount: i128, authorized, clawback }. */
export function parseBalanceFromLedgerEntry(entry: xdr.LedgerEntryData): bigint {
  const val = contractDataVal(entry);
  if (val.switch().value !== xdr.ScValType.scvMap().value) {
    throw new TypeError('SAC balance is not a map');
  }
  for (const item of val.map() ?? []) {
    const key = item.key();
    if (key.switch().value === xdr.ScValType.scvSymbol().value && key.sym().toString() === 'amount') {
      const amount = scValToNative(item.val());
      if (typeof amount !== 'bigint') throw new TypeError('SAC amount is not i128');
      return amount;
    }
  }
  throw new TypeError('SAC balance has no amount');
}

/** True when the contract instance is a Stellar Asset Contract (built-in executable). */
export function isStellarAssetInstance(entry: xdr.LedgerEntryData): boolean {
  const val = contractDataVal(entry);
  if (val.switch().value !== xdr.ScValType.scvContractInstance().value) return false;
  const executable = val.instance().executable();
  return executable.switch().value === xdr.ContractExecutableType.contractExecutableStellarAsset().value;
}

/** Comet `AllRecordData`: address → { balance, weight, scalar }. */
export function parseCometRecords(entry: xdr.LedgerEntryData): Map<string, CometRecord> {
  const val = contractDataVal(entry);
  if (val.switch().value !== xdr.ScValType.scvMap().value) throw new TypeError('Records are not a map');
  const out = new Map<string, CometRecord>();
  for (const item of val.map() ?? []) {
    const token = scValToNative(item.key());
    const record = scValToNative(item.val()) as Record<string, unknown>;
    if (typeof token !== 'string' || !record || typeof record !== 'object') {
      throw new TypeError('Malformed Comet record');
    }
    const { balance, weight, scalar } = record;
    if (typeof balance !== 'bigint' || typeof weight !== 'bigint' || typeof scalar !== 'bigint') {
      throw new TypeError('Malformed Comet record fields');
    }
    out.set(token, { balance, weight, scalar });
  }
  return out;
}

/** Comet instance storage `["SwapFeeConfig"]`. Returns null when absent. */
export function parseCometFeeConfig(entry: xdr.LedgerEntryData): (CometFeeConfig & { trackedToken: string }) | null {
  const val = contractDataVal(entry);
  if (val.switch().value !== xdr.ScValType.scvContractInstance().value) return null;
  for (const item of val.instance().storage() ?? []) {
    const key = item.key();
    if (key.switch().value !== xdr.ScValType.scvVec().value) continue;
    const parts = key.vec() ?? [];
    if (
      parts.length === 1 &&
      parts[0].switch().value === xdr.ScValType.scvSymbol().value &&
      parts[0].sym().toString() === 'SwapFeeConfig'
    ) {
      const cfg = scValToNative(item.val()) as Record<string, unknown>;
      const { tracked_token, min_fee, max_fee, low_util_balance, high_util_balance } = cfg ?? {};
      if (
        typeof tracked_token !== 'string' ||
        typeof min_fee !== 'bigint' ||
        typeof max_fee !== 'bigint' ||
        typeof low_util_balance !== 'bigint' ||
        typeof high_util_balance !== 'bigint'
      ) {
        throw new TypeError('Malformed SwapFeeConfig');
      }
      return {
        trackedToken: tracked_token,
        minFee: min_fee,
        maxFee: max_fee,
        lowUtilBalance: low_util_balance,
        highUtilBalance: high_util_balance,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SAC balances (tri-state)
// ---------------------------------------------------------------------------

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
    /** No balance entry on the reader: the holder never held / fully spent it. */
    | { status: 'missing' }
    /** Transport or decode failure. Ownership is UNKNOWN, never 0n. */
    | { status: 'error'; error: string }
  );

export function toBalanceResult(req: BalanceBatchRequest, read: LedgerEntryRead | undefined): BalanceBatchResult {
  if (!read) return { ...req, status: 'error', error: 'No read' };
  if (read.state === 'error') return { ...req, status: 'error', error: read.error };
  if (read.state === 'missing') return { ...req, status: 'missing' };
  try {
    return {
      ...req,
      status: 'known',
      balance: parseBalanceFromLedgerEntry(read.val),
      liveUntilLedgerSeq: read.liveUntilLedgerSeq,
      archived: read.liveUntilLedgerSeq !== undefined && read.liveUntilLedgerSeq < read.latestLedger,
    };
  } catch (error) {
    logger.error('balance', 'Malformed SAC balance entry:', error);
    return { ...req, status: 'error', error: 'Malformed balance entry' };
  }
}

/** Value of a tri-state result where `missing` means a known zero. */
export function knownBalance(result: BalanceBatchResult): bigint | null {
  if (result.status === 'known') return result.balance;
  if (result.status === 'missing') return 0n;
  return null;
}

export async function getBatchSACBalances(requests: BalanceBatchRequest[]): Promise<BalanceBatchResult[]> {
  if (requests.length === 0) return [];
  const keys: (string | null)[] = requests.map((req) => {
    try {
      return createSACBalanceLedgerKey(req.tokenContractId, req.holderAddress);
    } catch {
      return null;
    }
  });
  const reads = await readLedgerEntries(keys.filter((k): k is string => Boolean(k)));
  return requests.map((req, i) => {
    const key = keys[i];
    if (!key) return { ...req, status: 'error', error: 'Invalid address' };
    return toBalanceResult(req, reads.get(key));
  });
}
