/**
 * The final step of every relayed wallet action (PURE: every boundary is
 * injected, so the ordering itself is unit-tested).
 *
 *   await Turnstile token  →  beforeDispatch()  →  fetch(relayer)
 *                             └──── same tick, zero awaits ────┘
 *
 * The Turnstile challenge can take seconds, and the user can sign in as
 * someone else meanwhile. `beforeDispatch` is the action's LAST chance to
 * refuse: it runs after every asynchronous prerequisite and synchronously
 * immediately before the POST, so nothing can change the session between the
 * check and the request. If it throws, nothing is sent.
 */

/** Thrown when a pre-dispatch guard is not synchronous: nothing was sent. */
export class AsyncDispatchGuardError extends Error {
  constructor() {
    super('The final pre-send check must be synchronous, so nothing was sent.');
    this.name = 'AsyncDispatchGuardError';
  }
}

/**
 * Run a final pre-dispatch guard. It must be synchronous: a guard that returns
 * a promise could let the session change before it settles, so it is refused
 * (and the caller sends nothing).
 */
export function runDispatchGuard(guard: (() => void) | undefined): void {
  if (!guard) return;
  const result: unknown = guard();
  if (result !== null && typeof result === 'object' && typeof (result as PromiseLike<unknown>).then === 'function') {
    throw new AsyncDispatchGuardError();
  }
}

export interface RelayParams {
  xdr: string;
  relayerUrl: string | undefined;
  /** Resolves the Turnstile token (may wait on an interactive challenge). */
  getToken: () => Promise<string>;
  /** The token is single-use once it reached the relayer. */
  clearToken: () => void;
  /** Synchronous final guard; a throw means nothing is sent. */
  beforeDispatch?: () => void;
  fetchImpl?: typeof fetch;
}

export async function relayXdr(params: RelayParams): Promise<unknown> {
  const { xdr, relayerUrl } = params;
  if (!relayerUrl) throw new Error('Relayer URL not configured');
  const doFetch = params.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  const token = await params.getToken();

  // ── No await from here until the request is dispatched. ──
  runDispatchGuard(params.beforeDispatch);
  const pending = doFetch(relayerUrl, {
    method: 'POST',
    headers: {
      'X-Turnstile-Response': token,
    },
    body: new URLSearchParams({ xdr }),
  });
  // ── Dispatched. ──

  const response = await pending;
  params.clearToken();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Relayer proxy error: ${error}`);
  }

  return response.json();
}
