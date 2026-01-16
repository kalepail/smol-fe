
import * as StellarSdk from "@stellar/stellar-sdk";
const {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Networks,
    Account
} = StellarSdk.default || StellarSdk;

const SOROSWAP_API = 'https://api.soroswap.finance';
const AGGREGATOR_CONTRACT = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH"; // Updated to match production
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const PROTOCOL_MAP = {
    soroswap: 0,
    phoenix: 1,
    aqua: 2,
    comet: 3,
    sdex: 4
};

function poolHashesToScVal(poolHashes) {
    if (!poolHashes || poolHashes.length === 0) {
        return xdr.ScVal.scvVoid();
    }
    const scVec = poolHashes.map((base64Str) => {
        const binaryString = atob(base64Str);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return xdr.ScVal.scvBytes(Buffer.from(bytes));
    });
    return xdr.ScVal.scvVec(scVec);
}

function buildDistributionArg(distribution) {
    return xdr.ScVal.scvVec(
        distribution.map(d => {
            const protocolId = typeof d.protocol_id === "string"
                ? PROTOCOL_MAP[d.protocol_id.toLowerCase()] ?? 0
                : d.protocol_id;

            const entries = [
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("bytes"),
                    val: poolHashesToScVal(d.poolHashes)
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("parts"),
                    val: nativeToScVal(d.parts, { type: "u32" })
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("path"),
                    val: nativeToScVal(d.path.map(addr => new Address(addr)))
                }),
                new xdr.ScMapEntry({
                    key: xdr.ScVal.scvSymbol("protocol_id"),
                    val: nativeToScVal(protocolId, { type: "u32" })
                })
            ];
            return xdr.ScVal.scvMap(entries);
        })
    );
}

export class SoroswapProvider {
    constructor(config) {
        this.network = config.network;
        this.apiKey = process.env.SOROSWAP_API_KEY || config.soroswap?.apiKey || 'sk_4841707489b6c8a0ec4614bfa917be0b6518b0fd8b1f0cb08c0abe84de095b8f';
        this.xlmAsset = config.aquarius.xlmAsset;
        this.kaleAsset = config.aquarius.kaleTokenContractId;

        console.log(`🔄 SoroswapProvider: Aggregator ${AGGREGATOR_CONTRACT}`);
    }

    async getQuote({ direction, amountIn }) {
        const tokenIn = direction === 'xlm_to_kale' ? this.xlmAsset : this.kaleAsset;
        const tokenOut = direction === 'xlm_to_kale' ? this.kaleAsset : this.xlmAsset;

        const body = {
            assetIn: tokenIn,
            assetOut: tokenOut,
            amount: parseInt(amountIn),
            tradeType: "EXACT_IN",
            slippageBps: 500, // 5% - Factory Spec (Ohloss)
            protocols: ['soroswap', 'aqua', 'phoenix'],
            maxHops: 3,
            parts: 10
        };

        console.log(`   Fetching Soroswap Quote...`);
        const res = await fetch(`${SOROSWAP_API}/quote?network=mainnet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Soroswap API Error: ${res.status} - ${errText}`);
        }

        const quote = await res.json();
        console.log(`   ✅ Quote: ${amountIn} -> ${quote.rawTrade?.amountOutMin || 'N/A'}`);
        return quote;
    }

    async buildSwapXdr({ direction, amountIn, fromAddress }) {
        const quote = await this.getQuote({ direction, amountIn });
        const rawTrade = quote.rawTrade;

        if (!rawTrade) {
            throw new Error('No rawTrade in Soroswap quote');
        }

        const amountInBigInt = BigInt(quote.amountIn); // FIXED: Use quote.amountIn (not rawTrade.amountIn)
        const amountOutMin = BigInt(rawTrade.amountOutMin);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        const contract = new Contract(AGGREGATOR_CONTRACT);
        const distributionArg = buildDistributionArg(rawTrade.distribution);

        const firstPath = rawTrade.distribution[0].path;
        const tokenIn = firstPath[0];
        const tokenOut = firstPath[firstPath.length - 1];

        const invokeArgs = [
            nativeToScVal(new Address(tokenIn)),
            nativeToScVal(new Address(tokenOut)),
            nativeToScVal(amountInBigInt, { type: "i128" }),
            nativeToScVal(amountOutMin, { type: "i128" }),
            distributionArg,
            nativeToScVal(new Address(fromAddress)), // to
            nativeToScVal(deadline, { type: "u64" }),
        ];

        const invokeOp = contract.call("swap_exact_tokens_for_tokens", ...invokeArgs);

        const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
            fee: "10000000",
            networkPassphrase: this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
        })
            .addOperation(invokeOp)
            .setTimeout(300)
            .build();

        return { tx, quote };
    }
}
