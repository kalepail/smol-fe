/**
 * Wallet-session epoch for ledger read reuse (tiny, SDK-free: the balance store
 * imports it statically). The balance store bumps it whenever a new wallet
 * session starts (sign-in, account switch, sign-out); the coalescer never lets
 * a read join a request that was already SENT in an earlier session, so
 * returning to wallet A after B can never adopt A's pre-switch response.
 */
let epoch = 0;

export function ledgerSession(): number {
  return epoch;
}

export function bumpLedgerSession(): void {
  epoch++;
}
