
import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels';
import type { Transaction } from '@stellar/stellar-sdk';

export class RelayerServer {
    private client: ChannelsClient;

    constructor(options: { baseUrl: string; apiKey?: string }) {
        this.client = new ChannelsClient({
            baseUrl: options.baseUrl,
            apiKey: options.apiKey,
        });
    }

    async send(tx: Transaction | string): Promise<{ hash: string; status: string }> {
        let xdr: string;

        if (typeof tx === 'string') {
            xdr = tx;
        } else {
            // Assume it's a StellarSDK Transaction object
            xdr = tx.toXDR();
        }

        try {
            const result = await this.client.submitTransaction({
                xdr: xdr,
            });

            return {
                hash: result.hash,
                status: result.status,
            };
        } catch (error: any) {
            console.error("Relayer submission failed:", error);
            // extracting relevant error message if possible
            const msg = error?.response?.data?.error || error.message || "Unknown Relayer Error";
            throw new Error(`Relayer Error: ${msg}`);
        }
    }
}
