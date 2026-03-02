/**
 * Test Soroswap API's /quote/build endpoint with C-address
 * 
 * This tests whether the official Soroswap API can build transactions for C-addresses.
 */

const SOROSWAP_API = "https://api.soroswap.finance";
const API_KEY = process.env.PUBLIC_SOROSWAP_API_KEY;
const TEST_C_ADDRESS = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";

// Token addresses
const KALE = "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV";
const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

async function main() {
    console.log("📊 Getting quote for 1 KALE → XLM...");

    // Step 1: Get quote
    const quoteRes = await fetch(`${SOROSWAP_API}/quote?network=mainnet`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            assetIn: KALE,
            assetOut: XLM,
            amount: 10000000, // 1 KALE
            tradeType: "EXACT_IN",
            protocols: ["soroswap", "phoenix", "aqua", "sdex"],
            slippageBps: 100
        })
    });

    if (!quoteRes.ok) {
        throw new Error(`Quote failed: ${quoteRes.status} - ${await quoteRes.text()}`);
    }

    const quote = await quoteRes.json();
    console.log("✅ Quote received:");
    console.log("   Amount Out:", quote.amountOut, "XLM stroops");

    // Step 2: Try building with C-address via API
    console.log("\n🔧 Building transaction via Soroswap API with C-address...");
    console.log("   From:", TEST_C_ADDRESS.slice(0, 15) + "...");

    const buildRes = await fetch(`${SOROSWAP_API}/quote/build?network=mainnet`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            quote,
            from: TEST_C_ADDRESS,
            to: TEST_C_ADDRESS  // Swap to self
        })
    });

    const buildData = await buildRes.json();

    if (!buildRes.ok) {
        console.log("\n❌ BUILD FAILED:");
        console.log("   Status:", buildRes.status);
        console.log("   Error:", buildData.message || JSON.stringify(buildData));

        if (buildRes.status === 428) {
            console.log("\n⚠️  Multi-step signing required (428)");
            console.log("   This means C-addresses may need special handling");
        }

        process.exit(1);
    }

    console.log("\n✅ BUILD SUCCEEDED!");
    console.log("   XDR length:", buildData.xdr?.length || "no xdr", "bytes");
    console.log("\n🎉 Soroswap API supports C-addresses!");
}

main().catch(err => {
    console.error("💥 ERROR:", err.message);
    process.exit(1);
});
