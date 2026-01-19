import { PasskeyKit, SACClient } from "passkey-kit";
import { AssembledTransaction } from "@stellar/stellar-sdk/minimal/contract";
import type { Tx } from "@stellar/stellar-sdk/minimal/contract";
import { RPC_URL } from "./rpc";

// Lazy-initialized singletons (avoid SSR initialization on CF Workers)
let _account: PasskeyKit | null = null;
let _sac: SACClient | null = null;
let _kale: ReturnType<SACClient['getSACClient']> | null = null;
let _xlm: ReturnType<SACClient['getSACClient']> | null = null;

function getAccount(): PasskeyKit {
    if (!_account) {
        // console.log("[DEBUG] Initializing PasskeyKit with RPC:", RPC_URL);
        _account = new PasskeyKit({
            rpcUrl: RPC_URL,
            networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
            walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
            timeoutInSeconds: 60, // Increased from 30s to handle complex transactions
        });
    }
    return _account;
}

function getSac(): SACClient {
    if (!_sac) {
        _sac = new SACClient({
            rpcUrl: RPC_URL,
            networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
        });
    }
    return _sac;
}

function getKale() {
    if (!_kale) {
        _kale = getSac().getSACClient(
            import.meta.env.PUBLIC_KALE_SAC_ID || "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV"
        );
    }
    return _kale;
}

function getXlm() {
    if (!_xlm) {
        _xlm = getSac().getSACClient(
            import.meta.env.PUBLIC_XLM_SAC_ID || "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
        );
    }
    return _xlm;
}

// Export getters that lazy-init (safe for SSR)
export const account = { get: getAccount };
export const sac = { get: getSac };
export const kale = { get: getKale };
export const xlm = { get: getXlm };

/**
 * Send a transaction via Kale Farm Relayer (Raw XDR)
 *
 * Uses Turnstile for Sybil resistance and sponsored transaction fees.
 * Includes retry logic, timeout protection, and telemetry.
 *
 * Note: OpenZeppelin Channels integration is not currently implemented.
 * The relayer endpoint is hardcoded to KaleFarm API for now.
 */
export async function send<T>(
    txn: AssembledTransaction<T> | Tx | string,
    turnstileToken: string,
    options: {
        maxRetries?: number;
        timeoutMs?: number;
        retryDelayMs?: number;
    } = {}
) {
    const {
        maxRetries = 3,
        timeoutMs = 60000, // 60s default fetch timeout
        retryDelayMs = 2000, // Base delay for exponential backoff
    } = options;

    // Extract XDR from transaction
    let xdr: string;
    if (txn instanceof AssembledTransaction) {
        xdr = txn.built!.toXDR();
    } else if (typeof txn !== 'string') {
        xdr = txn.toXDR();
    } else {
        xdr = txn;
    }

    // Kale Farm API endpoint (sponsored transactions with Turnstile verification)
    const relayerUrl = import.meta.env.PUBLIC_RELAYER_URL || "https://api.kalefarm.xyz";

    let lastError: Error | null = null;

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const isRetry = attempt > 0;

        if (isRetry) {
            const delay = retryDelayMs * Math.pow(2, attempt - 1);
            console.log(`[Relayer] Retry attempt ${attempt}/${maxRetries} after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const startTime = Date.now();

            // Submit XDR to Kale Farm API with Turnstile token
            const response = await fetch(`${relayerUrl}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Turnstile-Response': turnstileToken,
                },
                body: JSON.stringify({ xdr }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;

            // Log telemetry
            console.log(`[Relayer] Response in ${responseTime}ms (attempt ${attempt + 1}/${maxRetries + 1})`);

            if (!response.ok) {
                const errorText = await response.text();

                // Distinguish between different error types
                if (response.status >= 500 && attempt < maxRetries) {
                    // Server error - retry
                    lastError = new Error(`Relayer server error (${response.status}): ${errorText}`);
                    console.warn(`[Relayer] Server error, will retry: ${lastError.message}`);
                    continue;
                } else if (response.status === 429 && attempt < maxRetries) {
                    // Rate limit - retry with longer backoff
                    lastError = new Error(`Relayer rate limit exceeded (${response.status})`);
                    console.warn(`[Relayer] Rate limited, will retry: ${lastError.message}`);
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs * 2));
                    continue;
                } else {
                    // Client error or final retry - don't retry
                    throw new Error(`Relayer submission failed (${response.status} ${response.statusText}): ${errorText}`);
                }
            }

            // Success - log and return
            if (isRetry) {
                console.log(`[Relayer] Success after ${attempt} retries`);
            }

            return response.json();

        } catch (error: any) {
            clearTimeout(timeoutId);

            // Distinguish between timeout and network errors
            if (error.name === 'AbortError') {
                lastError = new Error(`Relayer request timeout after ${timeoutMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
                console.error(`[Relayer] Timeout: ${lastError.message}`);

                if (attempt < maxRetries) {
                    console.log(`[Relayer] Will retry after timeout...`);
                    continue;
                }
            } else if (error.message?.includes('fetch')) {
                lastError = new Error(`Relayer network error: ${error.message}`);
                console.error(`[Relayer] Network error: ${lastError.message}`);

                if (attempt < maxRetries) {
                    console.log(`[Relayer] Will retry after network error...`);
                    continue;
                }
            } else {
                // Non-retryable error (e.g., validation error)
                throw error;
            }
        }
    }

    // All retries exhausted
    throw lastError || new Error(`Relayer submission failed after ${maxRetries + 1} attempts`);
}
