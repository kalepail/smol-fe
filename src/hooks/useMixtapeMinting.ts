/**
 * Mixtape mint helpers — LAZY-LOADED (smol-sdk, passkey-kit, Stellar SDK).
 *
 * - `submitMintBatch`: build ONE `coin_them` (≤5 songs), sign with ONE passkey
 *   prompt (explicit expiry, zero getLatestLedger), POST /mint. Minting makes
 *   the collector the owner: 10,000,000 tokens are minted to `user`.
 * - `pollMintSettlement`: ONE abortable, sequential poll loop for every
 *   outstanding mint on the page (replaces N per-track `GET /:id` intervals
 *   that inflated Views). Uses `POST /mint/status` when the API has it, else one
 *   batched on-chain read of the canonical SACs + holder balances per tick.
 */
import { Asset } from '@stellar/stellar-sdk/minimal';
import { Client as SmolClient } from 'smol-sdk';
import { logger } from '../utils/logger';
import { buildMintFeeRule } from '../utils/mint';
import { signWithPasskey } from '../utils/passkeySign';
import { pollUntilSettled, type SettlementRead } from '../utils/pollLoop';
import { getSignatureExpiration } from '../utils/rpcTip';
import { readMixtapeChainSnapshot } from '../utils/smolChainIdentity';
import { CANONICAL_SMOL_ID, SMOL_ISSUER } from '../utils/smolIdentity';
import { e2eSeams } from '../utils/collectSeams';
import { attributeMintStatus } from '../utils/mixtapeOwnership';

export class CollectRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CollectRequestError';
    this.status = status;
  }
}

export interface MintBatchTrack {
  id: string;
  creator: string;
}

export interface MintBatchResult {
  acceptedIds: string[];
  alreadyMintedIds: string[];
  /** Durable workflow ids when the API returns them (Report 31 POST /mint/status). */
  workflowIds: string[];
}

export async function submitMintBatch(params: {
  tracks: MintBatchTrack[];
  userContractId: string;
  userKeyId: string;
  /**
   * Pre-relay guard, called after the passkey returns and BEFORE POST /mint. It
   * must prove this attempt still owns the step and durably record
   * `submitting`; if it throws, the signed payload is discarded, never sent.
   */
  onBeforeSubmit: (info: { expiresAtLedger: number }) => void | Promise<void>;
}): Promise<MintBatchResult> {
  const { tracks, userContractId, userKeyId, onBeforeSubmit } = params;
  const seam = e2eSeams()?.mint;
  const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
  const kaleSacId = import.meta.env.PUBLIC_KALE_SAC_ID;
  if (!smolContractId || !kaleSacId) throw new Error('Minting is not configured');
  if (tracks.length === 0) return { acceptedIds: [], alreadyMintedIds: [], workflowIds: [] };

  const asset_bytes: Buffer[] = [];
  const salts: Buffer[] = [];
  const fee_rules: ReturnType<typeof buildMintFeeRule>[] = [];
  for (const track of tracks) {
    // Only canonical 64-hex ids are mintable: short ids alias each other's salt.
    if (!CANONICAL_SMOL_ID.test(track.id)) throw new Error(`Non-canonical smol id: ${track.id}`);
    const padded = track.id;
    const salt = Buffer.from(padded, 'hex');
    if (salt.length !== 32 || !track.creator) {
      throw new Error(`Invalid smol for minting: ${track.id}`);
    }
    asset_bytes.push(Buffer.from(new Asset(padded.substring(0, 12), SMOL_ISSUER).toXDRObject().toXDR()));
    salts.push(salt);
    fee_rules.push(buildMintFeeRule(track.creator, userContractId, kaleSacId));
  }

  const smolClient = new SmolClient({
    contractId: smolContractId,
    rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
  });

  const assemble = () => smolClient.coin_them({ user: userContractId, asset_bytes, salts, fee_rules });
  const tx = (seam?.assemble ? await seam.assemble() : await assemble()) as Awaited<ReturnType<typeof assemble>>;
  const expiration = seam?.expiration ? await seam.expiration() : await getSignatureExpiration();
  if (seam?.sign) await seam.sign();
  else await signWithPasskey(tx, { keyId: userKeyId, expiration });

  // No POST /mint unless this tab still owns the attempt AND `submitting` is saved.
  await onBeforeSubmit({ expiresAtLedger: expiration });

  if (seam?.relay) {
    await seam.relay(tracks.map((t) => t.id));
    return { acceptedIds: tracks.map((t) => t.id), alreadyMintedIds: [], workflowIds: [] };
  }
  const xdr = tx.built?.toXDR();
  if (!xdr) throw new Error('Failed to build signed coin_them transaction');

  const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/mint`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xdr, ids: tracks.map((t) => t.id) }),
  });
  if (!response.ok) {
    throw new CollectRequestError(response.status, `Mint request failed (${response.status})`);
  }
  const body = (await response.json().catch(() => null)) as {
    acceptedIds?: string[];
    skipped?: { alreadyMinted?: string[] };
    workflowId?: string;
    workflowIds?: string[];
  } | null;
  return {
    acceptedIds: body?.acceptedIds ?? tracks.map((t) => t.id),
    alreadyMintedIds: body?.skipped?.alreadyMinted ?? [],
    workflowIds: body?.workflowIds ?? (body?.workflowId ? [body.workflowId] : []),
  };
}

// ---------------------------------------------------------------------------
// One poll loop per page
// ---------------------------------------------------------------------------

/**
 * POST /mint/status is opt-in (PUBLIC_MINT_STATUS=1). Today's workflow routes
 * that path to POST /mint/:id and answers 400, so any 400/404/405/501 marks it
 * unsupported and the SAME tick falls back to one batched chain read.
 */
let mintStatusUnsupported = false;
const mintStatusEnabled = () =>
  !mintStatusUnsupported && (import.meta.env.PUBLIC_MINT_STATUS === '1' || Boolean(e2eSeams()?.mintStatus));

type MintTarget = { workflowIds: string[]; trackIds: string[] };

async function readMintStatus(
  ids: string[],
  targets: MintTarget[],
  signal: AbortSignal
): Promise<SettlementRead | null> {
  const workflowIds = targets.flatMap((t) => t.workflowIds);
  if (!mintStatusEnabled()) return null;
  if (workflowIds.length === 0) return new Map(); // nothing this poll may ask about
  try {
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/mint/status`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      // Report 31 MintStatusRequest: { workflowIds, target }.
      body: JSON.stringify({ workflowIds, target: { trackIds: ids } }),
      signal,
    });
    if ([400, 404, 405, 501].includes(response.status)) {
      mintStatusUnsupported = true;
      return null;
    }
    if (!response.ok) return null;
    const body = (await response.json()) as { batches?: { phase?: string; ids?: string[] }[] };
    if (!Array.isArray(body?.batches)) return null;
    // Per-step attribution: workflow AND exact songs must match one polled step.
    return attributeMintStatus(body.batches, targets.filter((t) => t.trackIds.some((id) => ids.includes(id))));
  } catch (error) {
    if (signal.aborted) throw error;
    return null; // transport blip: use the chain this tick
  }
}

async function readChainSettlement(ids: string[], holder: string): Promise<SettlementRead> {
  const snapshot = await readMixtapeChainSnapshot({ tracks: ids.map((id) => ({ id })), holder });
  const out: SettlementRead = new Map();
  for (const id of ids) {
    const read = snapshot.tracks.get(id);
    if (read?.facts.status === 'minted' && read.holding.status === 'known' && read.holding.balance > 0n) {
      out.set(id, 'settled');
    }
  }
  return out;
}

/** Poll until every id settles, the signal aborts, or `deadline` passes. */
export function pollMintSettlement(params: {
  ids: string[];
  /** Per-step request: each step's own workflow ids and songs. */
  targets?: MintTarget[];
  /** Ids whose attempt has no workflow id yet: settled from the chain only. */
  chainOnlyIds?: string[];
  holder: string;
  signal: AbortSignal;
  deadline: number;
  onSettled: (ids: string[]) => void;
  onFailed?: (ids: string[]) => void;
}): Promise<{ remaining: string[] }> {
  return pollUntilSettled({
    ids: params.ids,
    signal: params.signal,
    deadline: params.deadline,
    onSettled: params.onSettled,
    onFailed: params.onFailed,
    onTickError: (error) => logger.warn('mint', 'Mint status tick failed; retrying', error),
    read: async (ids, signal) => {
      const status = await readMintStatus(ids, params.targets ?? [], signal);
      if (status === null) return readChainSettlement(ids, params.holder);
      const chainOnly = ids.filter((id) => params.chainOnlyIds?.includes(id));
      // Receiptless ids never take an HTTP-derived outcome; the chain decides.
      for (const id of chainOnly) status.delete(id);
      if (chainOnly.length) {
        for (const [id, value] of await readChainSettlement(chainOnly, params.holder)) status.set(id, value);
      }
      return status;
    },
  });
}
