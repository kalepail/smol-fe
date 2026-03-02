
import { Horizon } from '@stellar/stellar-sdk';

// Mint Token from "Two Tall Hippies" (Created Dec 27, 2025)
const RECENT_MINT_TOKEN = 'CDCJBMT4ISI6CILQXJMIBZTIVREUYUATLYZX5VMPWQW7I5TW3WSSORGN';
const HORIZON_URL = 'https://horizon.stellar.org';

async function main() {
    const server = new Horizon.Server(HORIZON_URL);
    console.log(`Inspecting SAC: ${RECENT_MINT_TOKEN}...`);

    try {
        // SAC is a Contract.
        // But if it wraps a classic asset, we can find the asset details via Horizon /assets?asset_code=...&asset_issuer=...
        // Wait, we don't know the code/issuer yet.

        // We can query the Contract's State? Or Account?
        // Horizon /accounts/{contractId} might return data.

        const account = await server.loadAccount(RECENT_MINT_TOKEN);
        console.log(`Account ID: ${account.id}`);
        // console.log(`Balances:`, account.balances);

        // Loop balances, maybe one is interesting?
        // Usually SAC contract account doesn't hold balances in a revealing way.

        // BUT, if it was minted by `coin_it`, the ISSUER of the underlying asset is the Protocol Issuer.
        // How to map SAC -> Asset?
        // 1. Stellar Expert API (easiest)
        // 2. Soroban RPC `getLedgerEntry` (if we know the key)

        // Let's try Stellar Expert first (as used in scripts before)
        console.log('Querying Stellar Expert...');
        const seUrl = `https://api.stellar.expert/explorer/public/contract/${RECENT_MINT_TOKEN}`;
        const res = await fetch(seUrl);
        const data = await res.json();

        // console.log('SE Data:', JSON.stringify(data, null, 2));

        if (data.validation?.code) {
            console.log(`Asset Code: ${data.validation.code}`);
            console.log(`Asset Issuer: ${data.validation.issuer}`);

            console.log('*** FOUND ACTIVE ISSUER! *** ->', data.validation.issuer);
        } else {
            console.log('Stellar Expert did not return underlying asset info.');
        }

    } catch (e) {
        console.log('Error:', e.message);
    }
}

main().catch(console.error);
