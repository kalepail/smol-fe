
import * as StellarSdk from "@stellar/stellar-sdk";
const {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Operation,
    Networks,
    Account,
    StrKey
} = StellarSdk.default || StellarSdk;

const AQUARIUS_API = 'https://amm-api.aqua.network';

export class AquariusProvider {
    constructor(config) {
        this.network = config.network;
        this.poolId = config.aquarius.poolContractId;
        this.xlmAsset = config.aquarius.xlmAsset;
        this.kaleAsset = config.aquarius.kaleTokenContractId;

        this.tokenA = this.xlmAsset;
        this.tokenB = this.kaleAsset;

        console.log(`💧 AquariusProvider: Pool ${this.poolId}`);
        console.log(`   Token A (XLM): ${this.tokenA}`);
        console.log(`   Token B (KALE): ${this.tokenB}`);
    }

    async findPath({ direction, amountIn, isSend = true }) {
        const tokenIn = direction === 'xlm_to_kale' ? this.xlmAsset : this.kaleAsset;
        const tokenOut = direction === 'xlm_to_kale' ? this.kaleAsset : this.xlmAsset;

        const endpoint = isSend
            ? `${AQUARIUS_API}/api/external/v1/find-path/`
            : `${AQUARIUS_API}/api/external/v1/find-path-strict-receive/`;

        console.log(`   Calling Aquarius Find Path API...`);
        console.log(`   Token In: ${tokenIn}`);
        console.log(`   Token Out: ${tokenOut}`);
        console.log(`   Amount: ${amountIn}`);

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token_in_address: tokenIn,
                token_out_address: tokenOut,
                amount: parseInt(amountIn)
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Aquarius API Error: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        console.log(`   ✅ Path Found. Response Keys: ${Object.keys(data).join(', ')}`);
        console.log(`   Full Response: ${JSON.stringify(data).substring(0, 500)}...`);
        return data;
    }

    // Build swap transaction using the XDR from findPath
    async buildSwapXdr({ direction, amountIn, minOut, fromAddress, rpc }) {
        const pathResult = await this.findPath({ direction, amountIn, isSend: true });

        if (!pathResult.swap_chain_xdr) {
            throw new Error('No XDR returned from Aquarius API');
        }

        // The API returns an XDR ready for signing
        // We parse it for simulation
        const tx = TransactionBuilder.fromXDR(
            pathResult.swap_chain_xdr,
            this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
        );

        return { tx, pathResult };
    }
}
