/**
 * Custom error for non-ok API responses.
 * Captures status code, response body, and the endpoint that failed.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(status: number, message: string, endpoint: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

/**
 * Check a fetch Response and throw an ApiError if it is not ok.
 * Uses the response body text as the error message (falls back to statusText).
 */
export async function throwIfNotOk(response: Response, endpoint: string): Promise<void> {
  if (response.ok) return;
  const body = (await response.text().catch(() => '')) || response.statusText;
  throw new ApiError(response.status, body, endpoint);
}

const DEFAULT_TIMEOUT = 30_000;
const LONG_TIMEOUT = 60_000;

// In-flight GET request deduplication
const inflightGets = new Map<string, Promise<Response>>();

function rawFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number }
): Promise<Response> {
  const timeout = init?.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();

  // If the caller already passed a signal, abort our controller when theirs fires
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort(init.signal.reason);
    } else {
      init.signal.addEventListener('abort', () => controller.abort(init.signal!.reason), {
        once: true,
      });
    }
  }

  const timer = setTimeout(() => controller.abort('Request timed out'), timeout);

  const { timeout: _, ...fetchInit } = init ?? {};

  return fetch(input, { ...fetchInit, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

/**
 * Fetch with an automatic AbortController timeout.
 *
 * GET requests to the same URL are deduplicated — if an identical GET is
 * already in-flight the existing promise is returned instead of firing a
 * second request.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number }
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  // Only deduplicate simple GET requests (no custom signal — those are caller-controlled)
  if (method === 'GET' && !init?.signal) {
    const existing = inflightGets.get(url);
    if (existing) return existing;

    const promise = rawFetch(input, init).finally(() => {
      inflightGets.delete(url);
    });

    inflightGets.set(url, promise);

    // Failsafe: remove the entry after 60s even if the promise never settles
    setTimeout(() => inflightGets.delete(url), 60_000);

    return promise;
  }

  return rawFetch(input, init);
}

export { LONG_TIMEOUT };
