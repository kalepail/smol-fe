/**
 * FACTORY FRESH: Turnstile Store
 * @see https://deepwiki.com/repo/kalepail/smol-fe#turnstile-state
 * 
 * Global reactive state for the Cloudflare Turnstile token.
 * Used by PasskeyKit to attach bot-protection tokens to background transactions.
 */

export const turnstileState = $state({
    token: "" as string
});

export function setTurnstileToken(token: string) {
    turnstileState.token = token;
}

export function getTurnstileToken() {
    return turnstileState.token;
}
