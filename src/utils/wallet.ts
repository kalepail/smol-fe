import { getSessionGeneration, userState } from '../stores/user.svelte';
import { getWebAuthnRpId } from './rpId';
import { logger } from './logger';
import { createWalletSession, type WalletActionTicket } from './walletSession';

export type { WalletActionTicket } from './walletSession';

export type ConnectedWallet = typeof import('./passkey-kit');

/**
 * The ONE passkey-kit singleton, bound to the cookie session's wallet. See
 * `walletSession.ts`: restores are serialized, login / signup / logout start a
 * new epoch, and the singleton's actual signer is verified against
 * `userState.contractId` + `userState.keyId` before it is ever returned.
 * Non-wallet routes never pull passkey-kit or @stellar/stellar-sdk (lazy load).
 */
const session = createWalletSession<ConnectedWallet>({
  load: () => import('./passkey-kit'),
  identity: () => ({
    contractId: userState.contractId,
    keyId: userState.keyId,
    generation: getSessionGeneration(),
  }),
  rpId: () => getWebAuthnRpId(),
  onBindingChange: (bound) => {
    const connected =
      bound !== null && bound.contractId === userState.contractId && bound.keyId === userState.keyId;
    userState.walletConnected = connected;
    if (connected) logger.info('auth', 'Wallet connected');
  },
});

/**
 * Lazy-load passkey-kit with its wallet connected to EXACTLY the signed-in
 * account (restoring it from the session's key id when needed). Throws
 * `WalletSessionError` when signed out or when the account keeps changing
 * mid-connect — it never returns another account's signer. Pass the action's
 * ticket (`captureSessionTicket()` at submit) so a switch aborts the action.
 */
export async function getConnectedAccount(expected?: WalletActionTicket): Promise<ConnectedWallet> {
  try {
    return await session.getConnected(expected);
  } catch (error) {
    logger.error('auth', 'Failed to connect wallet:', error);
    throw error;
  }
}

/** Start of an interactive login / signup: invalidates every in-flight restore. */
export function beginWalletAuthTransition(): number {
  return session.invalidate();
}

/**
 * End of an interactive login / signup started at `ticket`: bind the singleton
 * to the wallet the passkey just connected / created, unless another auth
 * transition (or a stale restore) has since replaced it.
 */
export function completeInteractiveWallet(
  mod: ConnectedWallet,
  ticket: number,
  contractId: string,
  keyId: string
): boolean {
  return session.bindInteractive(mod, ticket, contractId, keyId);
}

/** Logout: invalidate every in-flight restore and drop the singleton's signer. */
export function signOutWallet(): void {
  session.signOut();
}

/**
 * Throws unless `wallet` still signs as the current session with `keyId` (and,
 * with `expected`, that session is still the action's own ticket).
 */
export function assertWalletSigner(wallet: ConnectedWallet, keyId: string, expected?: WalletActionTicket): void {
  session.assertSigner(wallet, keyId, expected);
}

/**
 * Throws `WalletActionSupersededError` unless the session is still exactly the
 * one the action's ticket was captured for. Call it right before every
 * irreversible step (build, passkey prompt, relay / POST).
 */
export function assertWalletAction(ticket: WalletActionTicket): void {
  session.assertTicket(ticket);
}

/**
 * The same check AFTER the passkey signed: a superseded action reports that
 * nothing was sent (`ACTION_SUPERSEDED_UNSENT_COPY`), since the signature
 * never leaves this device.
 */
export function assertWalletActionUnsent(ticket: WalletActionTicket): void {
  session.assertTicket(ticket, 'after-sign');
}

/**
 * The final, SYNCHRONOUS pre-dispatch guard for a signed wallet action, passed
 * to `send(tx, { beforeDispatch })` (or run right before POST /mint). It runs
 * after every asynchronous prerequisite (Turnstile, imports, XDR) and in the
 * same tick as the request, so nothing can switch the session in between:
 *
 *   ticket still current → `persist()` (e.g. record `submitting`) → ticket
 *   still current → the request is dispatched.
 *
 * Any throw cancels the dispatch; nothing is sent.
 */
export function walletDispatchGuard(ticket: WalletActionTicket, persist?: () => void): () => void {
  return () => {
    assertWalletActionUnsent(ticket);
    if (!persist) return;
    persist();
    assertWalletActionUnsent(ticket);
  };
}
