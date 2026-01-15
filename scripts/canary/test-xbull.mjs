
const API_BASE = "https://swap.apis.xbull.app";
const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
// Use a real G-address for testing xBull validation (this is a random one or generic)
const G_ADDRESS = "GBBM6BKZPEHWYO3E3YKRETPKQKSMRWWYD2EPBW87WKYQEJMJEOMTGMUF";
const AMOUNT = "100000000"; // 10 XLM

async function run() {
    console.log("Fetching quote from xBull API...");
    // maxSteps=3 is required
    const quoteUrl = `${API_BASE}/swaps/quote?fromAsset=${XLM}&toAsset=${USDC}&fromAmount=${AMOUNT}&sender=${G_ADDRESS}&maxSteps=3`;

    console.log("URL:", quoteUrl);

    try {
        const quoteRes = await fetch(quoteUrl);
        const quote = await quoteRes.json();

        console.log("Quote Response:", JSON.stringify(quote, null, 2));

        if (quote.error || !quote.route) {
            console.error("Quote failed");
            return;
        }

        console.log("Accepting quote...");
        const acceptBody = {
            fromAmount: AMOUNT,
            minToGet: "0",
            route: quote.route,
            sender: G_ADDRESS,
            recipient: G_ADDRESS,
            gasless: false
        };

        const acceptRes = await fetch(`${API_BASE}/swaps/accept-quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(acceptBody)
        });

        const accept = await acceptRes.json();
        console.log("Accept Response:", JSON.stringify(accept, null, 2));

        if (accept.xdr) {
            console.log("XDR Received:", accept.xdr);
            // Decode checks would go here, but seeing if we get XDR is step 1.
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
