// Using native fetch (Node 18+)

const SOROSWAP_API_BASE = 'https://api.soroswap.finance';
const API_KEY = 'sk_4841707489b6c8a0ec4614bfa917be0b6518b0fd8b1f0cb08c0abe84de095b8f'; // From .env

const ALIGNED_DEFAULTS = {
    slippageBps: 500, // 5% (Ohloss Factory Spec)
    protocols: ['soroswap', 'aqua', 'phoenix'], // Ohloss Factory Spec
    maxHops: 3,
    parts: 10
};

const TOKENS = {
    XLM: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
    KALE: 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV',
    USDC: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
};

async function getQuote() {
    console.log("Testing Soroswap Quote with Factory Spec Defaults...");

    // Simulate buying KALE with 10 XLM
    const body = {
        assetIn: TOKENS.XLM,
        assetOut: TOKENS.KALE, // Testing KALE specifically
        amount: 100000000, // 10 XLM (7 decimals)
        tradeType: "EXACT_IN",
        ...ALIGNED_DEFAULTS
    };

    console.log("Request Payload:", JSON.stringify(body, null, 2));

    try {
        const response = await fetch(`${SOROSWAP_API_BASE}/quote?network=mainnet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API Error ${response.status}: ${text}`);
        }

        const data = await response.json();
        console.log("\n✅ Quote Success!");
        console.log("Price Impact:", data.priceImpactPct + "%");
        console.log("Amount In:", data.amountIn);
        console.log("Amount Out:", data.amountOut);
        console.log("Route Plan:", JSON.stringify(data.routePlan, null, 2));

        // Validation
        if (!data.rawTrade || !data.rawTrade.distribution) {
            console.error("❌ FAIL: Missing rawTrade distribution (Factory Spec requires this for smart wallet)");
            process.exit(1);
        } else {
            console.log("✅ Distribution Present (Ready for aggregation)");
        }

    } catch (err) {
        console.error("❌ Quote Failed:", err.message);
        process.exit(1);
    }
}

getQuote();
