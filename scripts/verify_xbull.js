
// Using native fetch (Node 18+)

// --- CONFIGURATION ---
// xBull API Endpoint
const BASE_URL = "https://swap.apis.xbull.app";

// Assets
const FROM_ASSET = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"; // XLM Contract (xBull might prefer this over 'native')
const TO_ASSET = "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV"; // KALE (Mainnet)

// Params
const AMOUNT = "10000000"; // 10 XLM (7 decimals)
const SENDER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"; // NULL Account

async function testXBullFlow() {
    console.log("🥬 Starting xBull API Verification...");
    console.log(`Endpoint: ${BASE_URL}\n`);

    try {
        // 1. GET QUOTE
        console.log(`1. Fetching Quote (${FROM_ASSET} -> ${TO_ASSET})...`);

        const params = new URLSearchParams({
            fromAsset: FROM_ASSET,
            toAsset: TO_ASSET,
            fromAmount: AMOUNT,
            sender: SENDER, // Optional but good practice
            maxSteps: "3" // Required by xBull
        });

        const url = `${BASE_URL}/swaps/quote?${params.toString()}`;
        console.log(`   GET ${url}`);

        const res = await fetch(url);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Quote Failed: ${res.status} ${text}`);
        }
        const quote = await res.json();

        console.log("   ✅ Quote Received!");
        console.log(`      Route: ${JSON.stringify(quote.route)}`);
        console.log(`      Out:   ${quote.toAmount}`);

        // 2. ACCEPT QUOTE (Build TX)
        console.log("\n2. Building Transaction...");
        const acceptParams = {
            fromAmount: quote.fromAmount,
            minToGet: quote.toAmount,
            route: quote.route,
            sender: SENDER,
            recipient: SENDER
        };

        const txRes = await fetch(`${BASE_URL}/swaps/accept-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(acceptParams)
        });

        if (!txRes.ok) {
            const text = await txRes.text();
            throw new Error(`Build Failed: ${txRes.status} ${text}`);
        }

        const tx = await txRes.json();

        console.log("   ✅ Transaction Built!");
        console.log(`      ID:  ${tx.id || 'N/A'}`);
        console.log(`      XDR: ${tx.xdr ? tx.xdr.substring(0, 40) + '...' : 'MISSING'}`);

    } catch (err) {
        console.error("\n❌ Request Failed:", err.message);
        process.exit(1);
    }
}

testXBullFlow();
