/**
 * OZ Channels Relayer Adapter
 * 
 * Uses OpenZeppelin Channels hosted service for Stellar Soroban transaction submission.
 * Auth: Authorization: Bearer {apiKey}
 * Endpoint: POST / with { func, auth } body
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
     * 
     * Accepts Transaction, FeeBumpTransaction, or AssembledTransaction (from passkey-kit)
     */
    async send(tx: any): Promise<OzChannelsResult> {
        if (!this.apiKey) {
            throw new Error('OZ Channels API key not configured');
        }

        // Handle AssembledTransaction from passkey-kit (has .built property)
        let innerTx: any;
        if (tx.built) {
            // AssembledTransaction - access the .built Transaction
            innerTx = tx.built;
        } else if ('innerTransaction' in tx) {
            // FeeBumpTransaction
            innerTx = tx.innerTransaction;
        } else {
            // Regular Transaction
            innerTx = tx;
        }

        // Extract the Soroban operation (assuming single-op transaction)
        const ops = innerTx.operations;
        if (!ops || ops.length === 0) {
            throw new Error('Transaction has no operations');
        }

        const op = ops[0] as any; // InvokeHostFunctionOp

        if (!op.func) {
            throw new Error('Operation is not a Soroban invoke_host_function operation');
        }

        // Extract func and auth XDRs (base64 encoded)
        const func = op.func.toXDR('base64');
        const auth = (op.auth ?? []).map((a: any) => a.toXDR('base64'));

        console.log('[OzChannelsServer] Submitting via OZ Channels:', {
            func: func.substring(0, 50) + '...',
            authCount: auth.length
        });

        // Submit to OpenZeppelin Channels
        // Per DeepWiki: POST to root path / with Authorization: Bearer header
        const response = await fetch(`${this.baseUrl}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ func, auth }),
        });

        const responseText = await response.text();
        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error(`OZ Channels HTTP Error: ${response.status} ${response.statusText} - ${responseText.substring(0, 200)}`);
        }

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
}

// Default export for convenience
export { OzChannelsServer as RelayerServer };
