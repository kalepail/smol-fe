
const XBULL_API = 'https://swap.apis.xbull.app';
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export class XBullProvider {
    constructor(config) {
        this.network = config.network;
        this.xlmAsset = config.aquarius.xlmAsset;
        this.kaleAsset = config.aquarius.kaleTokenContractId;

        console.log(`🐂 XBullProvider: API ${XBULL_API}`);
    }

    async getQuote({ direction, amountIn }) {
        const fromAsset = direction === 'xlm_to_kale' ? this.xlmAsset : this.kaleAsset;
        const toAsset = direction === 'xlm_to_kale' ? this.kaleAsset : this.xlmAsset;

        const params = new URLSearchParams({
            fromAsset,
            toAsset,
            fromAmount: amountIn,
            sender: NULL_ACCOUNT,
            maxSteps: "3"
        });

        const url = `${XBULL_API}/swaps/quote?${params.toString()}`;

        console.log(`   Fetching xBull Quote...`);
        const res = await fetch(url);

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`xBull API Error: ${res.status} - ${errText}`);
        }

        const quote = await res.json();
        console.log(`   ✅ Quote: ${amountIn} -> ${quote.toAmount || 'N/A'}`);
        return quote;
    }

    async buildSwapXdr({ direction, amountIn, fromAddress }) {
        const quote = await this.getQuote({ direction, amountIn });

        if (!quote.route) {
            throw new Error('No route in xBull response');
        }

        // Accept the quote to get the transaction XDR
        console.log(`   Accepting xBull Quote...`);
        const acceptParams = {
            fromAmount: quote.fromAmount,
            minToGet: quote.toAmount,
            route: quote.route,
            sender: NULL_ACCOUNT,
            recipient: fromAddress
        };

        const acceptRes = await fetch(`${XBULL_API}/swaps/accept-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(acceptParams)
        });

        if (!acceptRes.ok) {
            const errText = await acceptRes.text();
            console.warn(`   ⚠️ xBull Accept Warning: ${errText}`);
            return { tx: null, quote, error: errText };
        }

        const acceptData = await acceptRes.json();
        console.log(`   ✅ Transaction XDR received`);

        return { tx: acceptData.xdr, quote };
    }
}
