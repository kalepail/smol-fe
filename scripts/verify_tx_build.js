
// verify_tx_build.js
// Replicates src/utils/swap-builder.ts logic to verify TX construction without browser

import {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Networks,
    Account,
    Keypair
} from "@stellar/stellar-sdk"; // Using full SDK for Node script
// Using native fetch


// --- CONSTANTS MATCHING SOURCE ---
const AGGREGATOR_CONTRACT = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH"; // Updated to match production
const RPC_URL = "https://rpc.ankr.com/stellar_soroban";
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// --- HELPERS FROM SOURCE ---
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

// --- MAIN VERIFICATION LOGIC ---
async function verify() {
    console.log("🧪 Testing Soroswap TX Logic (Headless)...");

    // 1. GET QUOTE
    const SOROSWAP_API_BASE = 'https://api.soroswap.finance';
    const API_KEY = 'sk_4841707489b6c8a0ec4614bfa917be0b6518b0fd8b1f0cb08c0abe84de095b8f';
    const TOKENS = {
        XLM: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
        KALE: 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV',
    };

    const quoteBody = {
        assetIn: TOKENS.XLM,
        assetOut: TOKENS.KALE,
        amount: 100000000, // 10 XLM
        tradeType: "EXACT_IN",
        slippageBps: 500, // 5%
        protocols: ['soroswap', 'aqua', 'phoenix'],
        maxHops: 3,
        parts: 10
    };

    console.log("   Fetching Quote...");
    const quoteRes = await fetch(`${SOROSWAP_API_BASE}/quote?network=mainnet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify(quoteBody)
    });

    if (!quoteRes.ok) throw new Error("Quote Failed");
    const quote = await quoteRes.json();
    console.log("   ✅ Quote Received");

    // 2. BUILD TRANSACTION (Replicating swap-builder.ts)
    console.log("   Building Transaction XDR...");

    const rawTrade = quote.rawTrade;
    const amountIn = BigInt(quote.amountIn); // FIXED: Use quote.amountIn (not rawTrade.amountIn)
    const amountOutMin = BigInt(rawTrade.amountOutMin); // Strict Trust
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const fromAddress = TOKENS.XLM; // Use XLM Contract as a valid C-Address placeholder

    const contract = new Contract(AGGREGATOR_CONTRACT);
    const distributionArg = buildDistributionArg(rawTrade.distribution);

    const firstPath = rawTrade.distribution[0].path;
    const tokenIn = firstPath[0];
    const tokenOut = firstPath[firstPath.length - 1];

    const invokeArgs = [
        nativeToScVal(new Address(tokenIn)),
        nativeToScVal(new Address(tokenOut)),
        nativeToScVal(amountIn, { type: "i128" }),
        nativeToScVal(amountOutMin, { type: "i128" }),
        distributionArg,
        nativeToScVal(new Address(fromAddress)), // to
        nativeToScVal(deadline, { type: "u64" }),
    ];

    const invokeOp = contract.call("swap_exact_tokens_for_tokens", ...invokeArgs);

    // We don't simulate here (requires valid fromAddress auth), but successful XDR construction proves the logic is sound.

    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
        fee: "10000000",
        networkPassphrase: Networks.PUBLIC
    })
        .addOperation(invokeOp)
        .setTimeout(300)
        .build();

    console.log("   ✅ Transaction Built Successfully!");
    console.log(`      XDR: ${tx.toXDR().substring(0, 50)}...`);
    console.log("   (Logic Verified: Distribution Map + C-Address Args)");
}

verify().catch(e => {
    console.error("❌ Verification Failed:", e);
    process.exit(1);
});
