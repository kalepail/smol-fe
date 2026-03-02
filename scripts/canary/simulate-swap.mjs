/**
 * Stellar RPC Simulation Test for C-Address Swap
 * Comprehensive Multi-Protocol Verification
 */

import {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Networks,
    Account,
    StrKey
} from "@stellar/stellar-sdk/minimal";
import { Server, Api, assembleTransaction } from "@stellar/stellar-sdk/minimal/rpc";

// Constants
const RPC_URL = process.env.PUBLIC_RPC_URL || "https://rpc.ankr.com/stellar_soroban";
const SOROSWAP_API = "https://api.soroswap.finance";
const AGGREGATOR_CONTRACT = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH"; // Updated to match production
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// Token addresses
const KALE = "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV";
const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"; // Mainnet USDC

// Test C-address
const TEST_C_ADDRESS = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";

const PROTOCOL_MAP = {
    soroswap: 0,
    phoenix: 1,
    aqua: 2,
    comet: 3,
    sdex: 4
};

// Test configurations
const TEST_CASES = [
    // KALE is mostly on Aqua/SDEX, so use KALE->XLM for Aqua
    { name: "Aqua (KALE->XLM)", protocol: "aqua", assetIn: KALE, assetOut: XLM, amount: 10000000 },
    // Use XLM->USDC for Soroswap to ensure liquidity and verify bytes=void logic
    { name: "Soroswap (XLM->USDC)", protocol: "soroswap", assetIn: XLM, assetOut: USDC, amount: 100000000 }, // 10 XLM
    // Phoenix for XLM->USDC
    { name: "Phoenix (XLM->USDC)", protocol: "phoenix", assetIn: XLM, assetOut: USDC, amount: 100000000 }
];

// ... [rest of helper functions same as before] ...
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
        if (bytes.length !== 32) throw new Error(`Expected 32 bytes, got ${bytes.length}`);
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
                new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("bytes"), val: poolHashesToScVal(d.poolHashes) }),
                new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("parts"), val: nativeToScVal(d.parts, { type: "u32" }) }),
                new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("path"), val: nativeToScVal(d.path.map(addr => new Address(addr))) }),
                new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("protocol_id"), val: nativeToScVal(protocolId, { type: "u32" }) })
            ];
            return xdr.ScVal.scvMap(entries);
        })
    );
}

async function getQuote(testCase) {
    console.log(`\n📊 Getting quote for ${testCase.name} via ${testCase.protocol}...`);
    const params = {
        assetIn: testCase.assetIn,
        assetOut: testCase.assetOut,
        amount: testCase.amount,
        tradeType: "EXACT_IN",
        protocols: [testCase.protocol],
        slippageBps: 100
    };

    const response = await fetch(`${SOROSWAP_API}/quote?network=mainnet`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.PUBLIC_SOROSWAP_API_KEY || ""}`
        },
        body: JSON.stringify(params)
    });

    if (!response.ok) {
        const text = await response.text();
        console.warn(`⚠️ Quote failed: ${response.status} - ${text}`);
        return null;
    }
    return response.json();
}

async function buildAndSimulate(quote) {
    console.log("🔧 Building transaction...");
    const rawTrade = quote.rawTrade;
    if (!rawTrade || !rawTrade.distribution) throw new Error("Quote missing distribution");

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const server = new Server(RPC_URL);
    const sourceAccount = new Account(NULL_ACCOUNT, "0");
    const aggregator = new Contract(AGGREGATOR_CONTRACT);
    const distributionArg = buildDistributionArg(rawTrade.distribution);

    const firstPath = rawTrade.distribution[0]?.path || [];
    const tokenIn = firstPath[0];
    const tokenOut = firstPath[firstPath.length - 1]; // Correct flattened path logic would be better but this works for basic check

    const invokeOp = aggregator.call(
        "swap_exact_tokens_for_tokens",
        nativeToScVal(new Address(tokenIn)),
        nativeToScVal(new Address(tokenOut)),
        nativeToScVal(BigInt(quote.amountIn), { type: "i128" }), // FIXED: Use quote.amountIn (not rawTrade.amountIn)
        nativeToScVal(BigInt(rawTrade.amountOutMin), { type: "i128" }),
        distributionArg,
        nativeToScVal(new Address(TEST_C_ADDRESS)),
        nativeToScVal(deadline, { type: "u64" })
    );

    const tx = new TransactionBuilder(sourceAccount, { fee: "10000000", networkPassphrase: Networks.PUBLIC })
        .addOperation(invokeOp)
        .setTimeout(300)
        .build();

    console.log("🚀 Simulating...");
    return { tx, simulated: await server.simulateTransaction(tx) };
}

async function runTest(testCase) {
    try {
        const quote = await getQuote(testCase);
        if (!quote) return false;

        // Log route for verification
        console.log(`   Route: ${quote.routePlan?.map(r => r.swapInfo?.protocol).join(" → ")}`);

        const { tx, simulated } = await buildAndSimulate(quote);

        if (Api.isSimulationError(simulated)) {
            console.error(`❌ ${testCase.name} FAILED:`, simulated.error);
            if (simulated.events) simulated.events.forEach(e => console.log(e));
            return false;
        }

        console.log(`✅ ${testCase.name} SUCCEEDED! Fee: ${simulated.minResourceFee}`);

        // Proper Auth Logging
        if (simulated.result?.auth?.length > 0) {
            // Correctly extract address
            let addrStr = "Unknown";
            try {
                // Try standard .toString() first
                addrStr = auth.credentials().address().toString();
            } catch (e) {
                try {
                    // If it's an Address object
                    addrStr = auth.credentials().address().address().toString();
                } catch (e2) {
                    // Fallback check
                    console.log("   Debug Auth Object:", JSON.stringify(auth.credentials().address()));
                }
            }

            console.log(`   Auth Address: ${addrStr}`);
            if (addrStr === TEST_C_ADDRESS) console.log("   ✅ Auth correctly targets C-address");
            else console.warn(`   ⚠️ Auth target mismatch! Expected ${TEST_C_ADDRESS}, got ${addrStr}`);
        } else {
            console.warn("   ⚠️ No auth entries! Suspicious.");
        }
        return true;
    } catch (e) {
        console.error(`💥 ${testCase.name} EXCEPTION:`, e.message);
        return false;
    }
}

async function main() {
    console.log("🧪 STARTING COMPREHENSIVE SWAP TESTS\n");
    let passed = 0;

    // Run Aqua first (proven)
    if (await runTest(TEST_CASES[0])) passed++;

    // Run Soroswap
    if (await runTest(TEST_CASES[1])) passed++;

    // Run Phoenix
    if (await runTest(TEST_CASES[2])) passed++;

    console.log(`\n🏁 SUMMARY: ${passed}/3 tests passed.`);
    if (passed === 3) console.log("Result: ALL TESTS PASSED ✅");
    else {
        console.log("Result: SOME TESTS FAILED ❌");
        process.exit(1);
    }
}

main();
