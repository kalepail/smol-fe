/**
 * Cross-tab auth notifications: the names, and the subscription a long-lived
 * shell (TopBar) uses to re-read the session cookie when another tab signs in
 * or out. Kept apart from `auth.ts` (which re-exports it) so every page's boot
 * closure carries only this, not the lazily loaded login / logout requests.
 */
export const AUTH_TRANSITION_STORAGE_KEY = 'smol_auth_transition';
export const AUTH_TRANSITION_CHANNEL = 'smol-auth-transitions';

export function getSafeBroadcastChannelCtor(): typeof BroadcastChannel | null {
  try {
    return typeof globalThis !== 'undefined' && 'BroadcastChannel' in globalThis ? globalThis.BroadcastChannel : null;
  } catch {
    return null;
  }
}

type AuthEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Call `onTransition` whenever another tab signs in / out (BroadcastChannel,
 * plus the `smol_auth_transition` storage event). Returns an idempotent
 * unsubscribe.
 */
export function subscribeAuthTransitions(
  onTransition: () => void,
  options?: { BroadcastChannelCtor?: typeof BroadcastChannel | null; target?: AuthEventTarget | null }
): () => void {
  let channel: BroadcastChannel | null = null;
  const ChannelCtor = options?.BroadcastChannelCtor !== undefined ? options.BroadcastChannelCtor : getSafeBroadcastChannelCtor();
  try {
    if (ChannelCtor) {
      channel = new ChannelCtor(AUTH_TRANSITION_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event?.data?.type === 'auth-transition') onTransition();
      };
    }
  } catch {
    channel = null;
  }

  const target = options?.target !== undefined ? options.target : typeof window !== 'undefined' ? window : null;
  const onStorage = (event: Event) => {
    if ((event as StorageEvent).key === AUTH_TRANSITION_STORAGE_KEY) onTransition();
  };
  target?.addEventListener('storage', onStorage);

  return () => {
    target?.removeEventListener('storage', onStorage);
    try {
      channel?.close();
    } catch {
      // Ignore close errors.
    }
    channel = null;
  };
}
