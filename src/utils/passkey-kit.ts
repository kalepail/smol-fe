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

/**
 * Send a transaction through the relayer proxy.
 * Supports two modes:
 * 1. DIRECT (OZ): Uses PUBLIC_RELAYER_API_KEY + channels.openzeppelin.com (Bypasses Turnstile)
 * 2. PROXY (KALE): Uses Turnstile token + api.kalefarm.xyz
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

    // Default to KaleFarm if no API key is present
    let relayerUrl = import.meta.env.PUBLIC_RELAYER_URL || "https://api.kalefarm.xyz";
    let headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (isDirectMode) {
        // Path 2: Direct to OpenZeppelin Channels
        relayerUrl = "https://channels.openzeppelin.com";
        headers['Authorization'] = `Bearer ${apiKey}`;

        // Log intent (pre-send)
        // logger.info(LogCategory.TRANSACTION, "Relayer Request (DIRECT)", { url: relayerUrl });
    } else {
        // Path 1: Proxy through KaleFarm with Turnstile
        const token = turnstileToken || getTurnstileToken();
        if (!token) {
            throw new Error('Turnstile token not available');
        }
        headers['X-Turnstile-Response'] = token;
        // logger.info(LogCategory.TRANSACTION, "Relayer Request (PROXY)", { url: relayerUrl, has_turnstile: !!token });
    }

    if (!relayerUrl) {
        throw new Error('Relayer URL not configured');
    }

    // Capture Request Debug Info for Dump
    const requestDebug = {
        url: relayerUrl,
        method: 'POST',
        headers: headers,
        body: isDirectMode ? { params: { xdr } } : { xdr }
    };

    let responseDebug: any = {};

    try {
        const response = await fetch(relayerUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(isDirectMode ? { params: { xdr } } : { xdr }),
        });

        // Capture Response Headers
        const responseHeaders = Object.fromEntries(response.headers.entries());
        const responseText = await response.text();

        responseDebug = {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseText
        };

        // Log the full interaction for the Dump button
        logger.info(LogCategory.RELAYER, "Relayer Interaction", {
            request: requestDebug,
            response: responseDebug
        });

        if (!response.ok) {
            // Re-throw with detailed debugging info
            const debugInfo = {
                ...responseDebug,
                url: relayerUrl,
                mode: isDirectMode ? 'DIRECT' : 'PROXY'
            };
            logger.error(LogCategory.TRANSACTION, `Relayer Failure (${response.status})`, debugInfo);
            throw new Error(`Relayer proxy error: ${responseText || response.statusText}`);
        }

        const result = JSON.parse(responseText);
        logger.info(LogCategory.TRANSACTION, "Relayer Success", { hash: result.hash || result.transactionHash });
        return result;

    } catch (e: any) {
        if (!responseDebug.status) {
            logger.error(LogCategory.RELAYER, "Relayer Network Failure", {
                request: requestDebug,
                error: e.message
            });
        }
        throw e;
    }
}
