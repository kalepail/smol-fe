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
import { Address, Asset, StrKey, hash, xdr } from '@stellar/stellar-sdk/minimal';
import {
  createCometRecordsLedgerKey,
  createContractInstanceLedgerKey,
  createSACBalanceLedgerKey,
  isStellarAssetInstance,
  parseCometRecords,
  readLedgerEntries,
  toBalanceResult,
  knownBalance,
  type LedgerEntryRead,
} from './batchLedgerEntries';
import { logger } from './logger';
import type { ChainFacts, Holding } from './mixtapeOwnership';

export const SMOL_ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';

export interface SmolIdentity {
  id: string;
  padded: string;
  assetCode: string;
  sac: string;
  pool: string;
}

const HEX_ID = /^[0-9a-fA-F]{1,64}$/;
const identityCache = new Map<string, SmolIdentity | null>();

export function deriveSmolIdentity(
  id: string,
  opts: { factory?: string; networkPassphrase?: string } = {}
): SmolIdentity | null {
  const factory = opts.factory ?? import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
  const network = opts.networkPassphrase ?? import.meta.env.PUBLIC_NETWORK_PASSPHRASE;
  if (!factory || !network || !HEX_ID.test(id)) return null;
  const cacheKey = `${network}|${factory}|${id}`;
  if (identityCache.has(cacheKey)) return identityCache.get(cacheKey) ?? null;

  let identity: SmolIdentity | null = null;
  try {
    const padded = id.padStart(64, '0');
    const assetCode = padded.slice(0, 12);
    const sac = new Asset(assetCode, SMOL_ISSUER).contractId(network);
    const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({
        networkId: hash(Buffer.from(network)),
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: new Address(factory).toScAddress(),
            salt: Buffer.from(padded, 'hex'),
          })
        ),
      })
    );
    const pool = StrKey.encodeContract(hash(preimage.toXDR()));
    identity = { id, padded, assetCode, sac, pool };
  } catch (error) {
    logger.warn('identity', `Could not derive identity for ${id}`, error);
  }
  identityCache.set(cacheKey, identity);
  return identity;
}

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

type Plan = {
  id: string;
  identity: SmolIdentity | null;
  sac: string | null;
  pool: string | null;
  sacKey?: string;
  recordsKey?: string;
  balanceKey?: string;
  d1Token: string | null;
  d1Amm: string | null;
};

/**
 * Read identity, pool reserves, holder balances and KALE for a set of tracks in
 * ONE coalesced getLedgerEntries call (3N+1 keys, chunked at 200).
 */
export async function readMixtapeChainSnapshot(input: {
  tracks: SnapshotTrackInput[];
  holder?: string | null;
  includeKale?: boolean;
}): Promise<MixtapeChainSnapshot> {
  const kaleSac = import.meta.env.PUBLIC_KALE_SAC_ID;
  const holder = input.holder ?? null;
  const keys: string[] = [];
  const plans: Plan[] = [];

  for (const t of input.tracks) {
    const identity = deriveSmolIdentity(t.id);
    const d1Token = t.mintToken || null;
    const d1Amm = t.mintAmm || null;
    const sac = identity?.sac ?? (d1Token && d1Amm ? d1Token : null);
    const pool = identity?.pool ?? (d1Token && d1Amm ? d1Amm : null);
    const plan: Plan = { id: t.id, identity, sac, pool, d1Token, d1Amm };
    try {
      if (identity) {
        plan.sacKey = createContractInstanceLedgerKey(identity.sac);
        keys.push(plan.sacKey);
      }
      if (pool) {
        plan.recordsKey = createCometRecordsLedgerKey(pool);
        keys.push(plan.recordsKey);
      }
      if (holder && sac) {
        plan.balanceKey = createSACBalanceLedgerKey(sac, holder);
        keys.push(plan.balanceKey);
      }
    } catch (error) {
      logger.warn('identity', `Invalid contract ids for ${t.id}`, error);
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
    const sacRead = plan.sacKey ? reads.get(plan.sacKey) : undefined;
    const recordsRead = plan.recordsKey ? reads.get(plan.recordsKey) : undefined;
    const balanceRead = plan.balanceKey ? reads.get(plan.balanceKey) : undefined;

    let kaleReserve: bigint | undefined;
    let recordsValid: boolean | null = null;
    if (recordsRead?.state === 'found' && plan.sac) {
      try {
        const records = parseCometRecords(recordsRead.val);
        const kaleRecord = kaleSac ? records.get(kaleSac) : undefined;
        if (!records.has(plan.sac) || !kaleRecord) throw new TypeError('Pool does not bind SAC + KALE');
        kaleReserve = kaleRecord.balance;
        recordsValid = true;
      } catch (error) {
        logger.warn('identity', `Pool records for ${plan.id} failed verification`, error);
        recordsValid = false;
      }
    }
    let sacIsAsset = false;
    try {
      sacIsAsset = sacRead?.state === 'found' && isStellarAssetInstance(sacRead.val);
    } catch {
      sacIsAsset = false;
    }

    let facts: ChainFacts;
    if (sacRead?.state === 'error' || recordsRead?.state === 'error' || recordsValid === false) {
      facts = { status: 'error' };
    } else if (!plan.identity) {
      facts =
        recordsValid && plan.sac && plan.pool
          ? { status: 'minted', sac: plan.sac, pool: plan.pool, kaleReserve }
          : { status: 'underivable' };
    } else if (recordsValid && sacIsAsset) {
      facts = { status: 'minted', sac: plan.identity.sac, pool: plan.identity.pool, kaleReserve };
    } else if (recordsRead?.state === 'missing') {
      // Pool absent on chain: the canonical song is mintable (coin_it reuses an
      // existing SAC). Archive-capable RPC returns archived entries, so absence
      // here means "never deployed".
      facts = { status: 'unminted' };
    } else {
      // Pool records exist but the canonical SAC doesn't: inconsistent, never act on it.
      facts = { status: 'error' };
    }

    let holding: Holding;
    if (!holder) {
      holding = { status: 'idle' };
    } else if (facts.status === 'unminted') {
      holding = { status: 'known', balance: 0n, checkedAt: now };
    } else if (facts.status === 'error') {
      holding = { status: 'error', message: 'Chain read failed' };
    } else if (plan.balanceKey) {
      const result = toBalanceResult(
        { tokenContractId: plan.sac ?? '', holderAddress: holder, id: plan.id },
        balanceRead
      );
      const value = knownBalance(result);
      holding =
        value === null
          ? { status: 'error', message: result.status === 'error' ? result.error : 'Unknown' }
          : { status: 'known', balance: value, checkedAt: now };
    } else if (!plan.sac) {
      // No token contract to hold (unminted per D1, underivable id): nothing to own.
      holding = { status: 'known', balance: 0n, checkedAt: now };
    } else {
      // The balance key couldn't be built: ownership is unknown, never 0n.
      holding = { status: 'error', message: 'Invalid holder or token address' };
    }
    if (holding.status === 'error' || facts.status === 'error') errors++;

    const d1Mismatch =
      facts.status === 'minted' && Boolean((plan.d1Token && plan.d1Token !== facts.sac) || (plan.d1Amm && plan.d1Amm !== facts.pool));
    const unindexed = facts.status === 'minted' && !plan.d1Token && !plan.d1Amm;
    if (d1Mismatch || unindexed || (facts.status === 'unminted' && (plan.d1Token || plan.d1Amm))) {
      logger.warn('identity', `D1 index differs from chain for ${plan.id}`, {
        d1Mismatch,
        unindexed,
        chain: facts.status,
      });
    }

    tracks.set(plan.id, { facts, holding, d1Mismatch, unindexed });
  }

  let kale: MixtapeChainSnapshot['kale'] = null;
  if (kaleKey) {
    const result = toBalanceResult({ tokenContractId: kaleSac, holderAddress: holder ?? '' }, reads.get(kaleKey));
    const value = knownBalance(result);
    kale = value === null ? { status: 'error' } : { status: 'known', balance: value };
  }

  return { latestLedger, tracks, kale, errors };
}
