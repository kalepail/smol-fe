
/**
 * OpenZeppelin Relayer Provider for Sponsored Transactions
 * Includes Turnstile verification support
 */

export class OZRelayerProvider {
    constructor(config) {
        this.baseUrl = config.ozRelayer.baseUrl;
        this.relayerId = config.ozRelayer.relayerId;
        this.apiKey = process.env.OZ_RELAYER_API_KEY || config.ozRelayer.apiKey;
        this.feeToken = config.ozRelayer.feeToken || 'native';
        this.network = config.network;
        this.turnstileEnabled = config.turnstile?.enabled || false;

        console.log(`🛡️  OZRelayerProvider: ${this.baseUrl}`);
        console.log(`   Relayer ID: ${this.relayerId}`);
        console.log(`   Turnstile: ${this.turnstileEnabled ? 'ENABLED' : 'disabled'}`);
    }

    async getSponsoredQuote(transactionXdr, turnstileToken = null) {
        const url = `${this.baseUrl}/api/v1/relayers/${this.relayerId}/transactions/sponsored/quote`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };

        // X-Api-Key sometimes used as alternate
        // headers['X-Api-Key'] = this.apiKey;

        // Add Turnstile token if provided
        if (turnstileToken) {
            headers['X-Turnstile-Token'] = turnstileToken;
        }

        console.log(`   Fetching Sponsored Quote...`);
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                transaction_xdr: transactionXdr,
                fee_token: this.feeToken
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OZ Quote Error: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        console.log(`   ✅ Quote: ${data.data?.fee_in_token_ui || 'N/A'} ${this.feeToken}`);
        return data;
    }

    async buildSponsoredTransaction(transactionXdr, turnstileToken = null) {
        const url = `${this.baseUrl}/api/v1/relayers/${this.relayerId}/transactions/sponsored/build`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };

        if (turnstileToken) {
            headers['X-Turnstile-Token'] = turnstileToken;
        }

        console.log(`   Building Sponsored Transaction...`);
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                transaction_xdr: transactionXdr,
                fee_token: this.feeToken
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OZ Build Error: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        console.log(`   ✅ Sponsored TX built (valid until: ${data.data?.valid_until || 'N/A'})`);
        return data;
    }

    async submitTransaction(signedXdr, turnstileToken = null) {
        const url = `${this.baseUrl}/api/v1/relayers/${this.relayerId}/transactions`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };

        if (turnstileToken) {
            headers['X-Turnstile-Token'] = turnstileToken;
        }

        console.log(`   Submitting to Relayer...`);
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                transaction_xdr: signedXdr,
                network: this.network === 'mainnet' ? 'mainnet' : 'testnet',
                fee_bump: true
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OZ Submit Error: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        console.log(`   ✅ Submitted (ID: ${data.data?.id || 'N/A'})`);
        return data;
    }
}
