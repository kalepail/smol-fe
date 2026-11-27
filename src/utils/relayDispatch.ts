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

export class RelayError extends Error {
  readonly status?: number;
  readonly preDispatch: boolean;
  readonly code?: string;
  readonly retryable?: boolean;

  constructor(message: string, options: {
    preDispatch: boolean;
    status?: number;
    code?: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(message, { cause: options.cause });
    this.name = 'RelayError';
    this.status = options.status;
    this.preDispatch = options.preDispatch;
    this.code = options.code;
    this.retryable = options.retryable;
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
  if (!relayerUrl) throw new RelayError('Relayer URL not configured', { preDispatch: true });
  try {
    const url = new URL(relayerUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Expected an HTTP(S) URL without embedded credentials');
    }
  } catch (cause) {
    throw new RelayError('Relayer URL is invalid', { preDispatch: true, cause });
  }

  let preDispatch = true;
  let response: Response;
  try {
    const token = await params.getToken();
    const request: RequestInit = {
      method: 'POST',
      headers: { 'X-Turnstile-Response': token },
      body: new URLSearchParams({ xdr }),
      signal: AbortSignal.timeout(30_000),
    };

    // No await between the guard and the POST.
    runDispatchGuard(params.beforeDispatch);
    preDispatch = false;
    response = await (params.fetchImpl ?? fetch)(relayerUrl, request);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not submit to the relayer';
    throw new RelayError(message, { preDispatch, cause });
  } finally {
    if (!preDispatch) params.clearToken();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let body: { error?: unknown; code?: unknown; retryable?: unknown } | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      // The HTTP status still applies if the body is missing or unreadable.
    }
    const message = typeof body?.error === 'string' ? body.error : text || `HTTP ${response.status}`;
    throw new RelayError(`Relayer proxy error: ${message}`, {
      status: response.status,
      preDispatch: false,
      code: typeof body?.code === 'string' ? body.code : undefined,
      retryable: typeof body?.retryable === 'boolean' ? body.retryable : undefined,
    });
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new RelayError('Could not read the relayer response', { status: response.status, preDispatch: false, cause });
  }
}
