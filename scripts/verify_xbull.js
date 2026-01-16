
import axios from 'axios';

// --- CONFIGURATION ---
// xBull API Endpoint
const BASE_URL = "https://swap.apis.xbull.app";

// Assets
// Try different formats if these fail (e.g. "XLM", "native", "USDC-ISSUER")
const FROM_ASSET = "native";
const TO_ASSET = "CCW67TSQI3ZWTIS3T2F7376X7T6Q4P63U2Z2Y63O24X5QG2Y6Q6Q6Q6Q"; // USDC Mainnet

// Params
const AMOUNT = "10000000"; // 1 unit (7 decimals)
const SENDER = "GAB75EBEJYZ34P3C6H7S5E3J6F7S5E3J6F7S5E3J6F7S5E3J6F7S5E3J"; // Public G-Address

async function testXBullFlow() {
    console.log("🥬 Starting xBull API Verification...");
    console.log(`Endpoint: ${BASE_URL}\n`);

    try {
        // 1. GET QUOTE
        console.log(`1. Fetching Quote (${FROM_ASSET} -> ${TO_ASSET})...`);

        const params = {
            fromAsset: FROM_ASSET,
            toAsset: TO_ASSET,
            fromAmount: AMOUNT,
            sender: SENDER,
            maxSteps: "3" // Required by xBull
        };

        const query = new URLSearchParams(params).toString();
        const url = `${BASE_URL}/swaps/quote?${query}`;
        console.log(`   GET ${url}`);

        const res = await axios.get(url);
        const quote = res.data;

        console.log("   ✅ Quote Received!");
        console.log(`      Route: ${quote.route}`);
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

        const txRes = await axios.post(`${BASE_URL}/swaps/accept-quote`, acceptParams);
        const tx = txRes.data;

        console.log("   ✅ Transaction Built!");
        console.log(`      ID:  ${tx.id}`);
        console.log(`      XDR: ${tx.xdr.substring(0, 40)}...`);

    } catch (err) {
        console.error("\n❌ Request Failed:");
        if (err.response) {
            console.error(`   Status: ${err.response.status}`);
            console.error("   Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("   Error:", err.message);
        }
    }
}

testXBullFlow();
