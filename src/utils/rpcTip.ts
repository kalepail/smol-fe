/**
 * Ledger tip for signature expirations — LAZY-LOADED (imports the RPC client).
 *
 * `rpc.getLatestLedger()` ships the full ledger metadata (~3.4 MB per call on
 * mainnet, Report 31). `rpc.getHealth()` returns the same `latestLedger` in
 * ~195 bytes. Concurrent callers within 2s share one request.
 */
import { rpc } from './base';

const TIP_TTL_MS = 2_000;
/** ~5 minutes at 5s ledgers: covers a slow passkey prompt. */
export const SIGNATURE_EXPIRATION_LEDGERS = 60;

let cached: { sequence: number; at: number } | null = null;
let inflight: Promise<number> | null = null;

export async function getLedgerTip(opts: { maxAgeMs?: number } = {}): Promise<number> {
  const maxAge = opts.maxAgeMs ?? TIP_TTL_MS;
  if (cached && Date.now() - cached.at < maxAge) return cached.sequence;
  if (inflight) return inflight;
  inflight = rpc
    .getHealth()
    .then((health) => {
      const sequence = Number(health.latestLedger);
      if (!Number.isFinite(sequence) || sequence <= 0) throw new Error('RPC health has no latest ledger');
      cached = { sequence, at: Date.now() };
      return sequence;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function getSignatureExpiration(ledgers = SIGNATURE_EXPIRATION_LEDGERS): Promise<number> {
  return (await getLedgerTip()) + ledgers;
}
