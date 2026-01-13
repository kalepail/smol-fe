/**
 * OZ Channels Relayer Adapter
 * 
 * Supports two modes:
 * 1. Soroban func+auth mode (for passkey-signed transactions)
 * 2. Pre-signed XDR mode (fallback)
 */

import type { Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';

const VERSION = "smol-fe/1.0.0";

export interface OzChannelsResult {
    transactionId: string;
    hash: string;
    status: string;
}

export class OzChannelsServer {
    private baseUrl: string;
    private apiKey?: string;

    constructor(options: { baseUrl?: string; apiKey?: string }) {
        this.baseUrl = options.baseUrl || 'https://channels.openzeppelin.com';
        this.apiKey = options.apiKey;
    }

    /**
     * Send a Soroban transaction using func+auth mode.
     * This extracts the host function and signed auth entries from the transaction
     * and submits them to OZ Channels for processing.
     */
    async sendSoroban(tx: Transaction | FeeBumpTransaction): Promise<OzChannelsResult> {
        if (!this.apiKey) {
            throw new Error('OZ Channels API key not configured');
        }

        // Get the inner transaction if this is a fee bump
        const innerTx = 'innerTransaction' in tx ? tx.innerTransaction : tx;

        // Extract the Soroban operation (assuming single-op transaction)
        const ops = innerTx.operations;
        if (ops.length === 0) {
            throw new Error('Transaction has no operations');
        }

        const op = ops[0] as any; // InvokeHostFunctionOp

        if (!op.func) {
            throw new Error('Operation is not a Soroban invoke_host_function operation');
        }

        // Extract func and auth XDRs (base64 encoded)
        const func = op.func.toXDR('base64');
        const auth = (op.auth ?? []).map((a: any) => a.toXDR('base64'));

        console.log('[OzChannelsServer] Submitting via func+auth mode:', {
            func: func.substring(0, 50) + '...',
            authCount: auth.length
        });

        // Submit to OpenZeppelin Channels
        const response = await fetch(`${this.baseUrl}/soroban`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': this.apiKey,
                'X-Client-Name': 'passkey-kit',
                'X-Client-Version': VERSION,
            },
            body: JSON.stringify({ func, auth }),
        });

        const result = await response.json();

        if (!response.ok) {
            const errorCode = result?.code || result?.error || response.statusText;
            const errorDetails = result?.details || result?.message || '';

            // Map OZ error codes to user-friendly messages
            let userMessage = `Channels API Error: ${errorCode}`;
            if (errorCode === 'FEE_LIMIT_EXCEEDED') {
                userMessage = 'Service fee limit reached. Please try again in 24 hours.';
            } else if (errorCode === 'POOL_CAPACITY') {
                userMessage = 'Network is busy. Please try again shortly.';
            } else if (errorCode === 'SIMULATION_FAILED') {
                userMessage = `Transaction simulation failed: ${errorDetails}`;
            } else if (errorCode === 'ONCHAIN_FAILED') {
                userMessage = `Transaction failed on-chain: ${errorDetails}`;
            }

            throw new Error(userMessage);
        }

        return {
            transactionId: result.transactionId,
            hash: result.hash,
            status: result.status || 'pending',
        };
    }

    /**
     * Send a pre-signed transaction XDR.
     * This is the fallback mode when you have a fully signed envelope.
     */
    async send(tx: Transaction | FeeBumpTransaction | string): Promise<OzChannelsResult> {
        if (!this.apiKey) {
            throw new Error('OZ Channels API key not configured');
        }

        let xdr: string;
        if (typeof tx === 'string') {
            xdr = tx;
        } else {
            xdr = tx.toXDR();
        }

        console.log('[OzChannelsServer] Submitting via XDR mode');

        const response = await fetch(`${this.baseUrl}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': this.apiKey,
                'X-Client-Name': 'passkey-kit',
                'X-Client-Version': VERSION,
            },
            body: JSON.stringify({ xdr }),
        });

        const result = await response.json();

        if (!response.ok) {
            const errorCode = result?.code || result?.error || response.statusText;
            const errorDetails = result?.details || result?.message || '';

            let userMessage = `Channels API Error: ${errorCode}`;
            if (errorCode === 'FEE_LIMIT_EXCEEDED') {
                userMessage = 'Service fee limit reached. Please try again in 24 hours.';
            } else if (errorCode === 'POOL_CAPACITY') {
                userMessage = 'Network is busy. Please try again shortly.';
            } else if (errorCode === 'INVALID_XDR') {
                userMessage = `Invalid transaction XDR: ${errorDetails}`;
            }

            throw new Error(userMessage);
        }

        return {
            transactionId: result.transactionId,
            hash: result.hash,
            status: result.status || 'pending',
        };
    }
}

// Legacy export for backward compatibility
export { OzChannelsServer as RelayerServer };
