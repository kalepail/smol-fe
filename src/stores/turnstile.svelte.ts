/**
 * Turnstile token state using Svelte 5 runes
 * Used for Cloudflare Turnstile bot protection on relayer requests
 */

export const turnstileState = $state<{
  token: string | null;
}>({
  token: null,
});

/**
 * Set the turnstile token
 */
export function setTurnstileToken(token: string) {
  turnstileState.token = token;
}

/**
 * Clear the turnstile token
 */
export function clearTurnstileToken() {
  turnstileState.token = null;
}

/**
 * Get the current turnstile token
 */
export function getTurnstileToken(): string | null {
  return turnstileState.token;
}

/**
 * Callback function for Cloudflare Turnstile widget
 * Called by the Turnstile widget when a token is generated
 */
export function turnstileCallback(token: string) {
  setTurnstileToken(token);
}
