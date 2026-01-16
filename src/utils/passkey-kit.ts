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
            timeoutInSeconds: 30,
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
 *
 * Note: OpenZeppelin Channels integration is not currently implemented.
 * The relayer endpoint is hardcoded to KaleFarm API for now.
 */
export async function send<T>(txn: AssembledTransaction<T> | Tx | string, turnstileToken: string) {
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

    // Submit XDR to Kale Farm API with Turnstile token
    const response = await fetch(`${relayerUrl}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Turnstile-Response': turnstileToken,
        },
        body: JSON.stringify({ xdr }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Relayer submission failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
}
