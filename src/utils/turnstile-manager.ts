/**
 * Turnstile Token Lifecycle Management
 *
 * Manages Turnstile token lifecycle, expiration tracking, and auto-refresh.
 * Prevents stale token usage and provides centralized token management.
 */

export interface TurnstileTokenState {
    token: string | null;
    issuedAt: number | null;
    expiresAt: number | null;
    isExpired: boolean;
}

const TOKEN_LIFETIME_MS = 300000; // 5 minutes (Turnstile default)
const TOKEN_REFRESH_BUFFER_MS = 30000; // Refresh 30s before expiration

class TurnstileTokenManager {
    private state: TurnstileTokenState = {
        token: null,
        issuedAt: null,
        expiresAt: null,
        isExpired: true,
    };

    private refreshCallback: (() => Promise<void>) | null = null;

    /**
     * Set a new token
     */
    setToken(token: string): void {
        const now = Date.now();
        this.state = {
            token,
            issuedAt: now,
            expiresAt: now + TOKEN_LIFETIME_MS,
            isExpired: false,
        };
        console.log('[TurnstileManager] Token set, expires at:', new Date(this.state.expiresAt!));
    }

    /**
     * Clear the current token
     */
    clearToken(): void {
        this.state = {
            token: null,
            issuedAt: null,
            expiresAt: null,
            isExpired: true,
        };
        console.log('[TurnstileManager] Token cleared');
    }

    /**
     * Get the current token (null if expired)
     */
    getToken(): string | null {
        this.updateExpirationStatus();
        return this.state.isExpired ? null : this.state.token;
    }

    /**
     * Get the raw token (even if expired) - use for debugging only
     */
    getRawToken(): string | null {
        return this.state.token;
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(): boolean {
        this.updateExpirationStatus();
        return this.state.isExpired;
    }

    /**
     * Check if token will expire soon (within refresh buffer)
     */
    shouldRefresh(): boolean {
        if (!this.state.expiresAt) return true;
        const now = Date.now();
        return now >= (this.state.expiresAt - TOKEN_REFRESH_BUFFER_MS);
    }

    /**
     * Get time until expiration (in ms)
     */
    getTimeUntilExpiration(): number {
        if (!this.state.expiresAt) return 0;
        return Math.max(0, this.state.expiresAt - Date.now());
    }

    /**
     * Update expiration status based on current time
     */
    private updateExpirationStatus(): void {
        if (this.state.expiresAt && Date.now() >= this.state.expiresAt) {
            this.state.isExpired = true;
            console.warn('[TurnstileManager] Token expired at:', new Date(this.state.expiresAt));
        }
    }

    /**
     * Set a callback to be called when token needs refresh
     */
    setRefreshCallback(callback: () => Promise<void>): void {
        this.refreshCallback = callback;
    }

    /**
     * Trigger token refresh via callback
     */
    async refresh(): Promise<void> {
        if (!this.refreshCallback) {
            console.warn('[TurnstileManager] No refresh callback set');
            return;
        }
        console.log('[TurnstileManager] Triggering token refresh');
        await this.refreshCallback();
    }

    /**
     * Validate token before transaction submission
     * @throws Error if token is invalid or expired
     */
    validateForTransaction(): void {
        if (!this.state.token) {
            throw new Error('No Turnstile token available. Please complete the CAPTCHA.');
        }

        this.updateExpirationStatus();

        if (this.state.isExpired) {
            throw new Error('Turnstile token has expired. Please refresh and try again.');
        }

        if (this.shouldRefresh()) {
            console.warn('[TurnstileManager] Token will expire soon, consider refreshing');
        }
    }

    /**
     * Get current state (read-only)
     */
    getState(): Readonly<TurnstileTokenState> {
        this.updateExpirationStatus();
        return { ...this.state };
    }
}

// Export singleton instance
export const turnstileManager = new TurnstileTokenManager();

/**
 * Helper function to safely get a valid token
 * Returns null if no valid token is available
 */
export function getValidTurnstileToken(): string | null {
    return turnstileManager.getToken();
}

/**
 * Helper function to validate token before transaction
 * Throws error if token is invalid
 */
export function validateTurnstileToken(): void {
    turnstileManager.validateForTransaction();
}
