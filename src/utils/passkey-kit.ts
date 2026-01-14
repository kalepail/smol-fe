import { PasskeyKit, SACClient } from "passkey-kit";
import { AssembledTransaction } from "@stellar/stellar-sdk/minimal/contract";
import type { Tx } from "@stellar/stellar-sdk/minimal/contract";
import { getTurnstileToken } from "../stores/turnstile.svelte";

export const account = new PasskeyKit({
    rpcUrl: import.meta.env.PUBLIC_RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
    timeoutInSeconds: 30,
});

export const sac = new SACClient({
    rpcUrl: import.meta.env.PUBLIC_RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
});

export const kale = sac.getSACClient(import.meta.env.PUBLIC_KALE_SAC_ID);

/**
 * Send a transaction through the relayer proxy with Turnstile authentication.
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

    const token = getTurnstileToken();
    if (!token) {
        throw new Error('Turnstile token not available');
    }

    const relayerUrl = import.meta.env.PUBLIC_RELAYER_URL;
    if (!relayerUrl) {
        throw new Error('Relayer URL not configured');
    }

    const response = await fetch(relayerUrl, {
        method: 'POST',
        headers: {
            'X-Turnstile-Response': token,
        },
        body: new URLSearchParams({ xdr }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Relayer proxy error: ${error}`);
    }

    return response.json();
}