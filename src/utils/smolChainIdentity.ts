/**
 * Canonical SMOL song identity + one-call mixtape chain snapshot.
 * LAZY-LOADED (imports the Stellar SDK) — only reach it via dynamic import().
 *
 * Derivation (Report 31, verified against mainnet receipts):
 *   padded = id.padStart(64, '0')            (hex ids of 1–64 digits only)
 *   SAC    = Asset(padded.slice(0, 12), SMOL_ISSUER).contractId(network)
 *   pool   = contract id deployed by the SMOL factory with salt = hex(padded)
 *
 * D1 can be stale (60–180s API cache), unindexed (minted on chain, empty D1
 * row) or cross-wired (D1 pair belongs to another song). The snapshot reads
 * the canonical pair on chain so the collector never buys the wrong song,
 * never re-mints a song someone else just minted (C-15), and never treats an
 * RPC error as "you own 0" (C-02).
 */
import {
  createCometRecordsLedgerKey,
  createContractInstanceLedgerKey,
  createSACBalanceLedgerKey,
  readLedgerEntries,
  toBalanceResult,
  knownBalance,
  type LedgerEntryRead,
} from './batchLedgerEntries';
import { interpretIdentity, type SmolIdentity } from './ledgerReads';
import { deriveSmolIdentity, findIdentityCollisions } from './smolIdentity';
import { logger } from './logger';
import type { ChainFacts, Holding } from './mixtapeOwnership';

export type { SmolIdentity } from './ledgerReads';
export { SMOL_ISSUER, deriveSmolIdentity, findIdentityCollisions } from './smolIdentity';

export interface IdentityKeys {
  sacInstance: string;
  poolInstance: string;
  poolRecords: string;
}

export function identityKeys(identity: SmolIdentity): IdentityKeys {
  return {
    sacInstance: createContractInstanceLedgerKey(identity.sac),
    poolInstance: createContractInstanceLedgerKey(identity.pool),
    poolRecords: createCometRecordsLedgerKey(identity.pool),
  };
}

export { interpretIdentity, type IdentityVerdict } from './ledgerReads';

export interface SnapshotTrackInput {
  id: string;
  mintToken?: string | null;
  mintAmm?: string | null;
}

export interface TrackChainRead {
  facts: ChainFacts;
  holding: Holding;
  /** D1 disagrees with the verified canonical pair (diagnostic, Report 31). */
  d1Mismatch: boolean;
  /** Minted on chain but D1 has no pair yet. */
  unindexed: boolean;
}

export interface MixtapeChainSnapshot {
  latestLedger: number | null;
  tracks: Map<string, TrackChainRead>;
  kale: { status: 'known'; balance: bigint } | { status: 'error' } | null;
  /** Count of reads that failed; > 0 means some tracks are `unknown`. */
  errors: number;
}

/**
 * Read canonical identity, pool executable + reserves, holder balances and KALE
 * for a set of songs in ONE coalesced getLedgerEntries call (4N+1 keys,
 * chunked at 200). Underivable ids are `unresolved`: a D1 pair is never
 * trusted just because its two contracts agree with each other.
 */
export async function readMixtapeChainSnapshot(input: {
  tracks: SnapshotTrackInput[];
  holder?: string | null;
  includeKale?: boolean;
}): Promise<MixtapeChainSnapshot> {
  const kaleSac = import.meta.env.PUBLIC_KALE_SAC_ID;
  const holder = input.holder ?? null;
  const keys: string[] = [];
  const plans: { track: SnapshotTrackInput; identity: SmolIdentity | null; keys?: IdentityKeys; balanceKey?: string; keyError?: boolean }[] = [];

  // Ambiguous aliases (shared SAC or pool across distinct ids) stay unresolved.
  const derived = input.tracks.map((t) => deriveSmolIdentity(t.id)).filter((i): i is SmolIdentity => i !== null);
  const colliding = findIdentityCollisions(derived);
  if (colliding.size) logger.warn('identity', `Ambiguous song identities: ${[...colliding].join(', ')}`);

  for (const track of input.tracks) {
    const identity = colliding.has(track.id) ? null : deriveSmolIdentity(track.id);
    const plan: (typeof plans)[number] = { track, identity };
    if (identity) {
      try {
        plan.keys = identityKeys(identity);
        keys.push(plan.keys.sacInstance, plan.keys.poolInstance, plan.keys.poolRecords);
        if (holder) {
          plan.balanceKey = createSACBalanceLedgerKey(identity.sac, holder);
          keys.push(plan.balanceKey);
        }
      } catch (error) {
        logger.warn('identity', `Invalid key for ${track.id}`, error);
        plan.keyError = true;
      }
    }
    plans.push(plan);
  }

  let kaleKey: string | null = null;
  if (input.includeKale && holder && kaleSac) {
    kaleKey = createSACBalanceLedgerKey(kaleSac, holder);
    keys.push(kaleKey);
  }

  const reads = keys.length ? await readLedgerEntries(keys) : new Map<string, LedgerEntryRead>();
  const now = Date.now();
  let latestLedger: number | null = null;
  let errors = 0;
  for (const read of reads.values()) {
    if (read.state !== 'error') latestLedger = Math.max(latestLedger ?? 0, read.latestLedger);
  }

  const tracks = new Map<string, TrackChainRead>();
  for (const plan of plans) {
    const d1Token = plan.track.mintToken || null;
    const d1Amm = plan.track.mintAmm || null;
    let facts: ChainFacts;
    if (!plan.identity) {
      facts = { status: 'unresolved' };
    } else if (plan.keyError || !plan.keys) {
      facts = { status: 'error' };
    } else {
      facts = interpretIdentity(
        plan.identity,
        {
          sacInstance: reads.get(plan.keys.sacInstance),
          poolInstance: reads.get(plan.keys.poolInstance),
          poolRecords: reads.get(plan.keys.poolRecords),
        },
        { kaleSac, requireAuditedPool: true }
      ).facts;
    }

    let holding: Holding;
    if (!holder || facts.status === 'unresolved') {
      holding = { status: 'idle' };
    } else if (facts.status === 'error') {
      holding = { status: 'error', message: 'Chain read failed' };
    } else if (facts.status === 'unminted') {
      holding = { status: 'known', balance: 0n, checkedAt: now };
    } else if (plan.balanceKey) {
      const result = toBalanceResult(
        { tokenContractId: plan.identity!.sac, holderAddress: holder, id: plan.track.id },
        reads.get(plan.balanceKey)
      );
      const value = knownBalance(result);
      holding =
        value === null
          ? {
              status: 'error',
              message: result.status === 'missing' ? 'Absent on an archive-blind reader' : result.status === 'error' ? result.error : 'Unknown',
            }
          : { status: 'known', balance: value, checkedAt: now };
    } else {
      holding = { status: 'error', message: 'Invalid holder or token address' };
    }
    if (holding.status === 'error' || facts.status === 'error') errors++;

    const d1Mismatch =
      facts.status === 'minted' && Boolean((d1Token && d1Token !== facts.sac) || (d1Amm && d1Amm !== facts.pool));
    const unindexed = facts.status === 'minted' && !d1Token && !d1Amm;
    if (d1Mismatch || unindexed || ((facts.status === 'unminted' || facts.status === 'unresolved') && (d1Token || d1Amm))) {
      logger.warn('identity', `D1 index differs from chain for ${plan.track.id}`, {
        d1Mismatch,
        unindexed,
        chain: facts.status,
      });
    }
    tracks.set(plan.track.id, { facts, holding, d1Mismatch, unindexed });
  }

  let kale: MixtapeChainSnapshot['kale'] = null;
  if (kaleKey) {
    const result = toBalanceResult({ tokenContractId: kaleSac, holderAddress: holder ?? '' }, reads.get(kaleKey));
    const value = knownBalance(result);
    kale = value === null ? { status: 'error' } : { status: 'known', balance: value };
  }

  return { latestLedger, tracks, kale, errors };
}
