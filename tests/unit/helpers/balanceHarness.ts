import { createBalanceCore, READ_ABORTED, type BalanceState } from '../../../src/stores/balanceCore.ts';
import { createLedgerCoalescer } from '../../../src/utils/ledgerCoalescer.ts';
import type { LedgerEntryRead } from '../../../src/utils/ledgerReads.ts';

export const A = 'CA_WALLET_A';
export const B = 'CB_WALLET_B';

export const tick = () => new Promise((r) => setImmediate(r));

/**
 * The real store wiring in miniature: `readKale` lazily "imports" the
 * transport (a held promise), re-validates with `isCurrent()`, then reads the
 * KALE key through a real coalescer whose session epoch the core bumps.
 */
export function harness(initialWallet: string | null = A) {
  const state: BalanceState = { balance: null, loading: false, error: false, address: null, checkedAt: 0 };
  let wallet: string | null = initialWallet;
  let cookieWallet: string | null = initialWallet;
  let epoch = 0;
  const ledger = new Map<string, bigint>([
    [A, 100n],
    [B, 200n],
  ]);
  /** Every RPC that actually went out: the keys it carried and how to answer it. */
  const rpcs: { keys: string[]; answer: () => void }[] = [];
  let holdTransport = false;
  let releaseTransport: (() => void) | null = null;
  const coalescer = createLedgerCoalescer(
    (keys) =>
      new Promise<Map<string, LedgerEntryRead>>((resolve) => {
        // The ledger value is sampled when the request is SENT.
        const snapshot = new Map(keys.map((k) => [k, { state: 'found', value: ledger.get(k) } as unknown as LedgerEntryRead]));
        rpcs.push({ keys, answer: () => resolve(snapshot) });
      }),
    { maxPerCall: 200, session: () => epoch }
  );
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const deferredFns: (() => void)[] = [];
  let pageAttempt = 0;
  const core = createBalanceCore(state, {
    readKale: async (address, { fresh, isCurrent }) => {
      if (holdTransport) await new Promise<void>((r) => (releaseTransport = r)); // lazy import in flight
      if (!isCurrent()) return READ_ABORTED;
      const read = (await coalescer.read(address, { fresh })) as unknown as { value?: bigint };
      return read.value ?? null;
    },
    activeWallet: () => wallet,
    validateSession: (address) => {
      wallet = cookieWallet;
      return wallet === address;
    },
    onSessionChange: () => {
      epoch++;
    },
    setTimer: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id) => timers.delete(id as number),
    defer: (fn) => deferredFns.push(fn),
    page: () => pageAttempt,
  });
  return {
    state,
    core,
    rpcs,
    timers,
    ledger,
    coalescer,
    holdImport: () => {
      holdTransport = true;
    },
    releaseImport: () => {
      holdTransport = false;
      releaseTransport?.();
    },
    switchTo: (w: string | null) => {
      wallet = w;
      cookieWallet = w;
    },
    clearCookie: () => {
      cookieWallet = null;
    },
    fireTimers: () => {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
    /** A client-side navigation: a new page attempt. */
    navigate: () => {
      pageAttempt++;
    },
    flushDeferred: () => {
      while (deferredFns.length) deferredFns.shift()!();
    },
  };
}
