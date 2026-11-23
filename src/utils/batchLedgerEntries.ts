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
import { Address, xdr } from '@stellar/stellar-sdk/minimal';
import { rpc } from './base';
import { logger } from './logger';
import {
  createArchiveCapability,
  isArchivedEntry,
  toBalanceResult,
  type BalanceBatchRequest,
  type BalanceBatchResult,
  type LedgerEntryRead,
} from './ledgerReads';

export {
  contractWasmHash,
  isStellarAssetInstance,
  isSupportedCometInstance,
  parseBalanceFromLedgerEntry,
  parseCometFeeConfig,
  parseCometRecords,
  SUPPORTED_COMET_WASM_HASHES,
} from './ledgerParsers';

export const MAX_LEDGER_KEYS_PER_CALL = 200;

export type { LedgerEntryRead } from './ledgerReads';

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

// ---------------------------------------------------------------------------
// Reader capability: does an omitted persistent entry mean "absent"?
// Since protocol 23 (CAP-62/66) RPC proxies getLedgerEntries to Core, which
// serves live AND hot-archive state. Older/unverified readers may silently omit
// evicted entries, so their omissions are treated as unknown.
// ---------------------------------------------------------------------------

const capability = createArchiveCapability({
  override: import.meta.env.PUBLIC_RPC_ARCHIVE_AWARE,
  probe: () =>
    rpc.getVersionInfo().then((info) => Number(info.protocolVersion) >= 23).catch((error) => {
      logger.warn('rpc', 'Could not verify reader archive capability', error);
      throw error;
    }),
});

export function getReaderArchiveAware(): Promise<boolean> {
  return capability.isAware();
}

const inflight = new Map<string, Promise<LedgerEntryRead>>();
let pending: Map<string, (read: LedgerEntryRead) => void> | null = null;

function canonical(key: string): string {
  return xdr.LedgerKey.fromXDR(key, 'base64').toXDR('base64');
}

async function fetchChunk(keys: string[], resolvers: Map<string, (r: LedgerEntryRead) => void>) {
  try {
    const [response, archiveAware] = await Promise.all([
      rpc.getLedgerEntries(...keys.map((k) => xdr.LedgerKey.fromXDR(k, 'base64'))),
      getReaderArchiveAware(),
    ]);
    const latestLedger = response.latestLedger;
    const byKey = new Map<string, (typeof response.entries)[number]>();
    for (const entry of response.entries ?? []) {
      if (entry?.key) byKey.set(entry.key.toXDR('base64'), entry);
    }
    for (const key of keys) {
      const entry = byKey.get(key);
      if (!entry?.val) {
        resolvers.get(key)?.({ state: 'missing', latestLedger, archiveAware });
        continue;
      }
      const liveUntil = entry.liveUntilLedgerSeq;
      const archived = isArchivedEntry(liveUntil, latestLedger);
      capability.observe(liveUntil);
      resolvers.get(key)?.({
        state: 'found',
        val: entry.val,
        lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq,
        liveUntilLedgerSeq: liveUntil,
        archived,
        latestLedger,
      });
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
// SAC balances (tri-state)
// ---------------------------------------------------------------------------

export type { BalanceBatchRequest, BalanceBatchResult } from './ledgerReads';
export { knownBalance, toBalanceResult } from './ledgerReads';

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
