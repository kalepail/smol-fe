/**
 * Passkey wallet session coordination (PURE: no passkey-kit / Stellar SDK
 * import, so it is unit-testable and costs nothing on non-wallet routes).
 *
 * passkey-kit's `PasskeyKit` is ONE mutable singleton: every `connectWallet()`
 * (an on-demand restore for the cookie session, or an interactive login /
 * signup) overwrites `account.wallet`, and `account.keyId` is only ever set by
 * the FIRST connect. Without coordination, a restore for wallet A that resolves
 * after B logged in leaves the singleton signing as A while the app shows B.
 *
 * This module tracks which `(contractId, keyId, epoch)` the singleton is
 * actually bound to:
 * - Login, signup and logout call `invalidate()` (new epoch): every connect
 *   started before is stale, and its result is never bound or returned.
 * - Restores are serialized (keyed single-flight, the epoch is part of the
 *   key), so two restores never interleave on the singleton.
 * - Before returning, the singleton itself is verified: its wallet contract id
 *   and key id must equal the CURRENT session identity. A stale connect that
 *   overwrote it is detected and the current wallet is re-connected.
 */
import { createSingleFlight } from './singleFlight.ts';

export interface WalletIdentity {
  contractId: string | null;
  keyId: string | null;
  /** Session generation: bumped on every identity change (see user store). */
  generation?: number;
}

/**
 * The session a wallet action was started for (captured at submit). While an
 * action holds one, the wallet session never follows a newer identity: any
 * change of contract, key or generation aborts the action instead.
 */
export interface WalletActionTicket {
  contractId: string;
  keyId: string;
  generation: number;
}

/** The parts of passkey-kit's `PasskeyKit` this module reads or writes. */
export interface PasskeySingleton {
  keyId: string | undefined;
  wallet?: { options: { contractId: string } } | undefined;
  connectWallet(opts: { rpId?: string; keyId?: string }): Promise<{ contractId: string }>;
}

export interface WalletModule {
  account: PasskeySingleton;
}

/** The session changed (login / logout / account switch) while connecting. */
export class WalletSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletSessionError';
  }
}

export const SIGNED_OUT_COPY = 'Sign in to continue.';
export const SESSION_CHANGED_COPY = 'Your account changed while connecting the wallet. Try again.';
export const ACTION_SUPERSEDED_COPY =
  'Your account changed before this could be sent, so it was cancelled. Nothing was signed or sent.';
/** After the passkey signed: the signature is discarded on this device, never sent. */
export const ACTION_SUPERSEDED_UNSENT_COPY =
  "Your account changed before this could be sent, so it was cancelled. Nothing was sent and you weren't charged.";

/**
 * Where the superseded action stopped: `before-sign` (nothing built into a
 * prompt, nothing signed) or `after-sign` (signed on this device, discarded
 * before the relay / POST, so nothing was sent).
 */
export type SupersededStage = 'before-sign' | 'after-sign';

/** The action's session ended (login / logout / switch): it must not continue. */
export class WalletActionSupersededError extends WalletSessionError {
  readonly stage: SupersededStage;
  constructor(stage: SupersededStage = 'before-sign') {
    super(stage === 'after-sign' ? ACTION_SUPERSEDED_UNSENT_COPY : ACTION_SUPERSEDED_COPY);
    this.name = 'WalletActionSupersededError';
    this.stage = stage;
  }
}

const MAX_CONNECT_ATTEMPTS = 3;

export function createWalletSession<M extends WalletModule>(deps: {
  load: () => Promise<M>;
  identity: () => WalletIdentity;
  rpId: () => string | undefined;
  /** Called whenever the bound identity changes (null = unbound). */
  onBindingChange?: (bound: { contractId: string; keyId: string } | null) => void;
}) {
  let epoch = 0;
  let bound: { contractId: string; keyId: string; epoch: number } | null = null;
  let loaded: M | null = null;
  const connectOnce = createSingleFlight<void>();

  async function load(): Promise<M> {
    loaded ??= await deps.load();
    return loaded;
  }

  function setBound(next: typeof bound) {
    bound = next;
    deps.onBindingChange?.(next ? { contractId: next.contractId, keyId: next.keyId } : null);
  }

  /** The singleton's ACTUAL signer is `(contractId, keyId)`. */
  function singletonIs(account: PasskeySingleton, contractId: string, keyId: string): boolean {
    return account.wallet?.options.contractId === contractId && account.keyId === keyId;
  }

  /** Bound to the current session at the current epoch, and the singleton agrees. */
  function isCurrent(mod: M, id: WalletIdentity): id is { contractId: string; keyId: string } {
    return (
      id.contractId !== null &&
      id.keyId !== null &&
      bound !== null &&
      bound.epoch === epoch &&
      bound.contractId === id.contractId &&
      bound.keyId === id.keyId &&
      singletonIs(mod.account, id.contractId, id.keyId)
    );
  }

  /**
   * Login / signup / logout boundary: every connect started before this call
   * is stale. Returns the new epoch, which an interactive connect passes back
   * to `bindInteractive`.
   */
  function invalidate(): number {
    epoch++;
    if (bound) setBound(null);
    return epoch;
  }

  /** Logout: invalidate AND drop the loaded singleton's signer. */
  function signOut(): void {
    invalidate();
    if (loaded) {
      loaded.account.wallet = undefined;
      loaded.account.keyId = undefined;
    }
  }

  /**
   * After an interactive `connectWallet` / `createWallet` for `(contractId,
   * keyId)` that began at `ticket` (from `invalidate()`): bind it only if no
   * other auth transition happened since AND the singleton still holds exactly
   * that wallet (a stale restore may have overwritten it meanwhile). Returns
   * whether it was bound; if not, the next `getConnected()` re-connects.
   */
  function bindInteractive(mod: M, ticket: number, contractId: string, keyId: string): boolean {
    if (ticket !== epoch) return false;
    if (mod.account.wallet?.options.contractId !== contractId) return false;
    // passkey-kit only sets `keyId` on its first connect: pin it to this login.
    mod.account.keyId = keyId;
    setBound({ contractId, keyId, epoch });
    return true;
  }

  /** Is the session still exactly the one `ticket` was captured for? */
  function isTicketCurrent(ticket: WalletActionTicket): boolean {
    const id = deps.identity();
    return (
      id.contractId === ticket.contractId &&
      id.keyId === ticket.keyId &&
      (id.generation ?? 0) === ticket.generation
    );
  }

  /** Throws `WalletActionSupersededError` once the ticket's session has ended. */
  function assertTicket(ticket: WalletActionTicket | undefined, stage?: SupersededStage): void {
    if (ticket && !isTicketCurrent(ticket)) throw new WalletActionSupersededError(stage);
  }

  /**
   * The passkey-kit module with its singleton connected to EXACTLY the current
   * session's wallet. Throws `WalletSessionError` when signed out or when the
   * session keeps changing mid-connect; never returns another wallet's signer.
   *
   * With `expected` (an action's ticket), it never follows a NEWER session:
   * once the identity or generation differs from the ticket, before or after
   * any wait, it throws `WalletActionSupersededError` (nothing is connected for
   * the new account on the old action's behalf).
   */
  async function getConnected(expected?: WalletActionTicket): Promise<M> {
    assertTicket(expected);
    const mod = await load();
    for (let attempt = 0; attempt < MAX_CONNECT_ATTEMPTS; attempt++) {
      assertTicket(expected);
      const id = deps.identity();
      if (!id.contractId || !id.keyId) throw new WalletSessionError(SIGNED_OUT_COPY);
      if (isCurrent(mod, id)) return mod;

      const startEpoch = epoch;
      const { contractId, keyId } = id;
      await connectOnce(`${startEpoch}|${contractId}|${keyId}`, async () => {
        // An earlier caller in this flight (or a login) may already have bound it.
        if (isCurrent(mod, deps.identity())) return;
        const connected = await mod.account.connectWallet({ rpId: deps.rpId(), keyId });
        // Overtaken by login / signup / logout, or the session switched (another
        // tab): this result is stale. Never bind it; the loop re-checks the
        // singleton (which this connect may just have overwritten).
        const now = deps.identity();
        if (epoch !== startEpoch || now.contractId !== contractId || now.keyId !== keyId) return;
        if (connected.contractId !== contractId) {
          throw new WalletSessionError('This passkey belongs to a different wallet than the signed-in account.');
        }
        mod.account.keyId = keyId;
        setBound({ contractId, keyId, epoch });
      });
    }
    assertTicket(expected);
    const id = deps.identity();
    if (isCurrent(mod, id)) return mod;
    throw new WalletSessionError(id.contractId && id.keyId ? SESSION_CHANGED_COPY : SIGNED_OUT_COPY);
  }

  /**
   * Right before signing: the singleton must still be the CURRENT session's
   * wallet AND the key the caller asked to sign with. Guards the window between
   * `getConnected()` returning and the passkey prompt.
   */
  function assertSigner(mod: M, keyId: string, expected?: WalletActionTicket): void {
    assertTicket(expected);
    if (expected && expected.keyId !== keyId) throw new WalletActionSupersededError();
    const id = deps.identity();
    if (!isCurrent(mod, id) || id.keyId !== keyId) {
      throw new WalletSessionError(SESSION_CHANGED_COPY);
    }
  }

  return {
    getConnected,
    invalidate,
    signOut,
    bindInteractive,
    assertSigner,
    assertTicket,
    isTicketCurrent,
    /** Test/diagnostic view of what the singleton is bound to. */
    binding: () => (bound ? { ...bound, current: bound.epoch === epoch } : null),
  };
}
