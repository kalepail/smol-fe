import { PasskeyKit, SACClient } from "passkey-kit";
import { AssembledTransaction } from "@stellar/stellar-sdk/minimal/contract";
import type { Tx } from "@stellar/stellar-sdk/minimal/contract";
import { RPC_URL } from "./rpc";

console.log("[DEBUG] Initializing PasskeyKit with RPC:", RPC_URL);

export const account = new PasskeyKit({
    rpcUrl: RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
    timeoutInSeconds: 30,
});

export const sac = new SACClient({
    rpcUrl: RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
});

export const kale = sac.getSACClient(
    import.meta.env.PUBLIC_KALE_SAC_ID || "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV"
);

// XLM Stellar Asset Contract (Mainnet)
export const xlm = sac.getSACClient(
    import.meta.env.PUBLIC_XLM_SAC_ID || "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"
);

/**
 * Send a transaction via OZ Relayer Channels (Raw XDR)
 * 
 * Aligns with upstream architecture but uses API keys instead of Turnstile.
 */
export async function send<T>(txn: AssembledTransaction<T> | Tx | string) {
    // Extract XDR from transaction
    let xdr: string;
    if (txn instanceof AssembledTransaction) {
        xdr = txn.built!.toXDR();
    } else if (typeof txn !== 'string') {
        xdr = txn.toXDR();
    } else {
        xdr = txn;
    }

    const relayerUrl = import.meta.env.PUBLIC_CHANNELS_BASE_URL || "https://channels.openzeppelin.com";
    const apiKey = import.meta.env.PUBLIC_CHANNELS_API_KEY;

    if (!apiKey) {
        throw new Error('Relayer API key not configured');
    }

    // Submit XDR to OZ Channels endpoint
    const response = await fetch(`${relayerUrl}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${apiKey}`,
        },
        // Tyler uses URLSearchParams for body, likely matching OZ expectation for XDR POST
        body: new URLSearchParams({ xdr }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Relayer submission failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
}
