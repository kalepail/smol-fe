import { PasskeyKit, SACClient } from "passkey-kit";
import { AssembledTransaction } from "@stellar/stellar-sdk/minimal/contract";
import type { Tx } from "@stellar/stellar-sdk/minimal/contract";
import { getTurnstileToken } from "../stores/turnstile.svelte.ts";
import logger, { LogCategory } from "./debug-logger";

import { getRpcUrl } from "./rpc";

/**
 * Singleton PasskeyKit instance.
 *
 * CRITICAL: PasskeyKit.sign() requires the wallet to be connected first.
 * The sign() method accesses `this.wallet.options` internally, which is only
 * set after connectWallet() is called. Creating a new instance for each
 * operation loses this state.
 */
let _passkeyKitInstance: PasskeyKit | null = null;

function getPasskeyKit(): PasskeyKit {
    if (!_passkeyKitInstance) {
        _passkeyKitInstance = new PasskeyKit({
            rpcUrl: getRpcUrl(),
            networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
            walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
            timeoutInSeconds: 30,
        });
    }
    return _passkeyKitInstance;
}

/**
 * Reset the PasskeyKit singleton (for logout/disconnect scenarios)
 */
export function resetPasskeyKit(): void {
    _passkeyKitInstance = null;
}

export const account = {
    get: getPasskeyKit
};

export const sac = {
    get: () => new SACClient({
        rpcUrl: getRpcUrl(), // Dynamic failover
        networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    })
};

export const kale = {
    get: () => sac.get().getSACClient(import.meta.env.PUBLIC_KALE_SAC_ID)
};

export const xlm = {
    get: () => sac.get().getSACClient(import.meta.env.PUBLIC_XLM_SAC_ID || "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA")
};

export const usdc = {
    get: () => sac.get().getSACClient("CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75")
};

/**
 * Send a transaction through the relayer proxy.
 * Supports two modes:
 * 1. DIRECT (OZ): Uses PUBLIC_RELAYER_API_KEY + channels.openzeppelin.com (Bypasses Turnstile)
 * 2. PROXY (KALE): Uses Turnstile token + api.kalefarm.xyz
 *
 * AI DEBUG GUIDE:
 * - If "DIRECT mode" logs appear but fails with 503: OZ relayer is overloaded
 * - If "PROXY mode" fails with "Missing X-Turnstile-Response": No captcha token available
 * - If failover attempted but fails: pages.dev users can't use PROXY (no Turnstile)
 * - Check isDirectMode to see which path is taken
 */
export async function send<T>(txn: AssembledTransaction<T> | Tx | string, turnstileToken?: string) {
    // Extract XDR from transaction
    let xdr: string;
    if (txn instanceof AssembledTransaction) {
        xdr = txn.built!.toXDR();
    } else if (typeof txn !== 'string') {
        xdr = txn.toXDR();
    } else {
        xdr = txn;
    }

    const apiKey = import.meta.env.PUBLIC_RELAYER_API_KEY;
    const isDirectMode = !!apiKey;
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'server';
    const storedToken = getTurnstileToken();

    // AI DEBUG: Log relayer decision context
    console.log('[Relayer] Configuration:', {
        mode: isDirectMode ? 'DIRECT (OZ)' : 'PROXY (KaleFarm)',
        hasApiKey: !!apiKey,
        hostname,
        hasTurnstileToken: !!(turnstileToken || storedToken),
        turnstileSource: turnstileToken ? 'passed' : storedToken ? 'stored' : 'none',
        xdrLength: xdr.length,
    });

    let relayerUrl = "";
    let headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    const getRelayerConfig = (useDirect: boolean) => {
        if (useDirect) {
            return {
                url: "https://channels.openzeppelin.com",
                headers: { ...headers, 'Authorization': `Bearer ${apiKey}` },
                body: { params: { xdr } }
            };
        } else {
            const token = turnstileToken || getTurnstileToken();
            const isLocalhost = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
            if (!token && !isLocalhost) {
                // If we are on pages.dev and have no token, this might fail unless we promote.
                // But for now, we try.
            }
            return {
                url: import.meta.env.PUBLIC_RELAYER_URL || "https://api.kalefarm.xyz",
                headers: { ...headers, 'X-Turnstile-Response': token || '' },
                body: { xdr }
            };
        }
    };

    async function attemptSend(useDirect: boolean) {
        const config = getRelayerConfig(useDirect);

        const requestDebug = {
            url: config.url,
            method: 'POST',
            headers: config.headers,
            body: config.body
        };

        const response = await fetch(config.url, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify(config.body),
        });

        const responseText = await response.text();
        const responseDebug = {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseText
        };

        logger.info(LogCategory.RELAYER, `Relayer Interaction (${useDirect ? 'DIRECT' : 'PROXY'})`, {
            request: requestDebug,
            response: responseDebug
        });

        if (!response.ok) {
            throw { status: response.status, text: responseText, isDirect: useDirect };
        }

        return JSON.parse(responseText);
    }

    try {
        if (isDirectMode) {
            console.log('[Relayer] Attempting DIRECT mode (OZ)...');
            try {
                const result = await attemptSend(true);
                console.log('[Relayer] DIRECT mode SUCCESS:', { hash: result.hash || result.transactionHash });
                return result;
            } catch (err: any) {
                // AI DEBUG: Log the exact failure reason
                console.error('[Relayer] DIRECT mode FAILED:', {
                    status: err.status,
                    text: err.text?.substring(0, 200),
                    isDirect: err.isDirect,
                });

                // FAILOVER: If OZ is 503/502, try KaleFarm ONLY if we have a Turnstile token
                // pages.dev users won't have Turnstile, so don't failover for them
                if ((err.status === 503 || err.status === 502)) {
                    const token = turnstileToken || getTurnstileToken();
                    console.log('[Relayer] Checking failover eligibility:', {
                        ozStatus: err.status,
                        hasTurnstileForFailover: !!token,
                        willFailover: !!token,
                    });
                    if (token) {
                        console.warn('[Relayer] DIRECT mode failed, attempting failover to PROXY...');
                        return await attemptSend(false);
                    } else {
                        console.warn('[Relayer] DIRECT mode failed (503), no Turnstile token for failover');
                        // AI DEBUG: This is the key error for pages.dev users when OZ is down
                        throw new Error('Relayer temporarily unavailable. Please try again in a moment.');
                    }
                }
                throw err;
            }
        } else {
            console.log('[Relayer] Attempting PROXY mode (KaleFarm)...');
            const result = await attemptSend(false);
            console.log('[Relayer] PROXY mode SUCCESS:', { hash: result.hash || result.transactionHash });
            return result;
        }
    } catch (e: any) {
        const msg = e.text || e.message || "Relayer failure";
        // AI DEBUG: Final failure with full context
        logger.error(LogCategory.TRANSACTION, `Final Relayer Failure`, {
            error: msg,
            mode: isDirectMode ? 'DIRECT' : 'PROXY',
            hostname,
            hadTurnstile: !!(turnstileToken || storedToken),
        });
        throw new Error(`Relayer proxy error: ${msg}`);
    }
}
