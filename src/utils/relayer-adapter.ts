
import type { Transaction } from '@stellar/stellar-sdk';

export class RelayerServer {
    private baseUrl: string;
    private apiKey?: string;

    constructor(options: { baseUrl: string; apiKey?: string }) {
        this.baseUrl = options.baseUrl;
        this.apiKey = options.apiKey;
    }

    async send(tx: Transaction | string): Promise<{ hash: string; status: string }> {
        let xdr: string;

        if (typeof tx === 'string') {
            xdr = tx;
        } else {
            // Assume it's a StellarSDK Transaction object
            xdr = tx.toXDR();
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.apiKey) {
            headers['X-Api-Key'] = this.apiKey;
        }

        try {
            // Using the standard Channels/Relayer submission endpoint structure
            // If the user provided a specific Channels URL, it will be used.
            // Otherwise, we default to the Defender API or the one provided in passkey-kit.ts
            const response = await fetch(`${this.baseUrl}/txs`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    xdr: xdr,
                }),
            });

            const responseText = await response.text();
            let result;

            try {
                result = JSON.parse(responseText);
            } catch (e) {
                // Non-JSON response (e.g., 502 Gateway Error)
                throw new Error(`Relayer HTTP Error: ${response.status} ${response.statusText} - ${responseText.substring(0, 100)}`);
            }

            if (!response.ok) {
                const msg = result?.error || result?.message || response.statusText;
                throw new Error(`Relayer API Error: ${msg}`);
            }

            return {
                hash: result.hash || result.transactionId, // Handle potential API variations
                status: result.status || 'pending',
            };

        } catch (error: any) {
            console.error("Relayer submission failed:", error);
            throw new Error(error.message || "Unknown Relayer Error");
        }
    }
}
