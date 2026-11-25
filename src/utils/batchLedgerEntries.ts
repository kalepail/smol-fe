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
 *   `fresh` reads bypass an already-sent request (see ledgerCoalescer.ts).
 */
import { xdr } from '@stellar/stellar-sdk/minimal';
import { createSACBalanceLedgerKey } from './ledgerKeys';
import { createLedgerCoalescer } from './ledgerCoalescer';
import { ledgerSession } from './ledgerSession';
import { rpc } from './base';
import { logger } from './logger';
import {
  createArchiveCapability,
  interpretLedgerResponse,
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

// Key builders (SDK built-ins; see ledgerKeys.ts)
export {
  createCometRecordsLedgerKey,
  createContractInstanceLedgerKey,
  createSACBalanceLedgerKey,
} from './ledgerKeys';

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

// ---------------------------------------------------------------------------
// Coalesced reader
// ---------------------------------------------------------------------------

function canonical(key: string): string {
  return xdr.LedgerKey.fromXDR(key, 'base64').toXDR('base64');
}

async function fetchChunk(keys: string[]): Promise<Map<string, LedgerEntryRead>> {
  try {
    const [response, archiveAware] = await Promise.all([
      rpc.getLedgerEntries(...keys.map((k) => xdr.LedgerKey.fromXDR(k, 'base64'))),
      getReaderArchiveAware(),
    ]);
    const reads = interpretLedgerResponse(
      keys,
      response as { latestLedger?: unknown; entries?: unknown },
      (entries) =>
        (entries as (typeof response.entries)[number][])
          .filter((entry) => entry?.key)
          .map((entry) => ({
            keyB64: entry.key.toXDR('base64'),
            val: entry.val,
            lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq,
            liveUntilLedgerSeq: entry.liveUntilLedgerSeq,
          })),
      archiveAware
    );
    const first = reads.get(keys[0]);
    if (first?.state === 'error') logger.error('rpc', first.error);
    for (const read of reads.values()) {
      if (read.state === 'found') capability.observe(read.liveUntilLedgerSeq);
    }
    return reads;
  } catch (error) {
    logger.error('rpc', 'getLedgerEntries failed:', error);
    throw error;
  }
}

const coalescer = createLedgerCoalescer(fetchChunk, { maxPerCall: MAX_LEDGER_KEYS_PER_CALL, session: ledgerSession });

/**
 * Read any set of ledger keys (base64 XDR). Keys requested together (or by
 * concurrent callers in the same tick) go out in ⌈unique/200⌉ calls.
 * `fresh` (an explicit Refresh) never joins an already-sent older read.
 */
export async function readLedgerEntries(
  keys: string[],
  opts: { fresh?: boolean } = {}
): Promise<Map<string, LedgerEntryRead>> {
  const out = new Map<string, LedgerEntryRead>();
  const unique = new Map<string, string>();
  for (const key of keys) {
    try {
      unique.set(key, canonical(key));
    } catch (error) {
      out.set(key, { state: 'error', error: error instanceof Error ? error.message : 'Invalid key' });
    }
  }
  const reads = await Promise.all([...unique].map(async ([raw, key]) => [raw, await coalescer.read(key, opts)] as const));
  for (const [raw, read] of reads) out.set(raw, read);
  return out;
}

// ---------------------------------------------------------------------------
// SAC balances (tri-state)
// ---------------------------------------------------------------------------

export type { BalanceBatchRequest, BalanceBatchResult } from './ledgerReads';
export { knownBalance, toBalanceResult } from './ledgerReads';

export async function getBatchSACBalances(
  requests: BalanceBatchRequest[],
  opts: { fresh?: boolean } = {}
): Promise<BalanceBatchResult[]> {
  if (requests.length === 0) return [];
  const keys: (string | null)[] = requests.map((req) => {
    try {
      return createSACBalanceLedgerKey(req.tokenContractId, req.holderAddress);
    } catch {
      return null;
    }
  });
  const reads = await readLedgerEntries(keys.filter((k): k is string => Boolean(k)), opts);
  return requests.map((req, i) => {
    const key = keys[i];
    if (!key) return { ...req, status: 'error', error: 'Invalid address' };
    return toBalanceResult(req, reads.get(key));
  });
}
