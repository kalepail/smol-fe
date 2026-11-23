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
import { SMOL_ISSUER, readMixtapeChainSnapshot } from '../utils/smolChainIdentity';

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
}

export async function submitMintBatch(params: {
  tracks: MintBatchTrack[];
  userContractId: string;
  userKeyId: string;
  /** Fires once the passkey signature is done (UI: Approve → Sending). */
  onSigned?: () => void;
}): Promise<MintBatchResult> {
  const { tracks, userContractId, userKeyId, onSigned } = params;
  const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
  const kaleSacId = import.meta.env.PUBLIC_KALE_SAC_ID;
  if (!smolContractId || !kaleSacId) throw new Error('Minting is not configured');
  if (tracks.length === 0) return { acceptedIds: [], alreadyMintedIds: [] };

  const asset_bytes: Buffer[] = [];
  const salts: Buffer[] = [];
  const fee_rules: ReturnType<typeof buildMintFeeRule>[] = [];
  for (const track of tracks) {
    const padded = track.id.padStart(64, '0');
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

  const tx = await smolClient.coin_them({ user: userContractId, asset_bytes, salts, fee_rules });
  await signWithPasskey(tx, { keyId: userKeyId });
  onSigned?.();
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
  } | null;
  return {
    acceptedIds: body?.acceptedIds ?? tracks.map((t) => t.id),
    alreadyMintedIds: body?.skipped?.alreadyMinted ?? [],
  };
}

// ---------------------------------------------------------------------------
// One poll loop per page
// ---------------------------------------------------------------------------

/** null = unknown, false = API has no /mint/status (fallback to chain reads). */
let mintStatusSupported: boolean | null = import.meta.env.PUBLIC_MINT_STATUS === '1' ? true : null;

async function readMintStatus(ids: string[], signal: AbortSignal): Promise<Map<string, 'settled' | 'failed'> | null> {
  if (mintStatusSupported === false) return null;
  try {
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/mint/status`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal,
    });
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      mintStatusSupported = false;
      return null;
    }
    if (!response.ok) return new Map();
    mintStatusSupported = true;
    const body = (await response.json()) as {
      batches?: { phase?: string; ids?: string[] }[];
    };
    const out = new Map<string, 'settled' | 'failed'>();
    for (const batch of body.batches ?? []) {
      const phase = batch.phase;
      if (phase === 'persisted' || phase === 'confirmed' || phase === 'failed') {
        for (const id of batch.ids ?? []) out.set(id, phase === 'failed' ? 'failed' : 'settled');
      }
    }
    return out;
  } catch (error) {
    if (signal.aborted) throw error;
    // A network blip is not "unsupported": retry next tick.
    return new Map();
  }
}

async function readChainSettlement(ids: string[], holder: string): Promise<Map<string, 'settled'>> {
  const snapshot = await readMixtapeChainSnapshot({ tracks: ids.map((id) => ({ id })), holder });
  const out = new Map<string, 'settled'>();
  for (const id of ids) {
    const read = snapshot.tracks.get(id);
    if (read?.facts.status === 'minted' && read.holding.status === 'known' && read.holding.balance > 0n) {
      out.set(id, 'settled');
    }
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/**
 * Poll until every id settles, the signal aborts, or `deadline` passes.
 * Ticks never overlap; backoff 3s → 8s with jitter.
 */
export async function pollMintSettlement(params: {
  ids: string[];
  holder: string;
  signal: AbortSignal;
  deadline: number;
  onSettled: (ids: string[]) => void;
  onFailed?: (ids: string[]) => void;
}): Promise<{ remaining: string[] }> {
  const remaining = new Set(params.ids);
  let delay = 3_000;
  await sleep(1_500, params.signal);
  while (remaining.size > 0 && Date.now() < params.deadline) {
    const ids = [...remaining];
    try {
      const status = (await readMintStatus(ids, params.signal)) ?? (await readChainSettlement(ids, params.holder));
      const settled = ids.filter((id) => status.get(id) === 'settled');
      const failed = ids.filter((id) => status.get(id) === 'failed');
      for (const id of [...settled, ...failed]) remaining.delete(id);
      if (settled.length) params.onSettled(settled);
      if (failed.length) params.onFailed?.(failed);
    } catch (error) {
      if (params.signal.aborted) throw error;
      logger.warn('mint', 'Mint status tick failed; retrying', error);
    }
    if (remaining.size === 0) break;
    await sleep(delay + Math.floor(Math.random() * 500), params.signal);
    delay = Math.min(8_000, Math.round(delay * 1.4));
  }
  return { remaining: [...remaining] };
}
