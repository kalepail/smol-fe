
const BASE_URL = "/api/xbull";

export interface XBullQuoteParams {
    fromAsset: string;
    toAsset: string;
    fromAmount: string; // U128 string
    maxSteps?: string;
    gasless?: boolean;
    sender?: string;
}

export interface XBullQuoteResponse {
    route: string; // UUID
    fromAmount: string;
    toAmount: string;
    fromAsset: string;
    toAsset: string;
    fee: string;
    gasFee?: string;
}

export interface XBullAcceptQuoteParams {
    fromAmount: string;
    minToGet: string;
    route: string; // UUID from quote
    sender: string;
    recipient: string;
    gasless?: boolean;
}

export interface XBullAcceptQuoteResponse {
    id: string; // UUID
    xdr: string; // base64
    type?: "full" | "restore";
}

export async function getXBullQuote(params: XBullQuoteParams): Promise<XBullQuoteResponse> {
    const query = new URLSearchParams({
        fromAsset: params.fromAsset,
        toAsset: params.toAsset,
        fromAmount: params.fromAmount,
        maxSteps: params.maxSteps || "3",
        gasless: String(params.gasless || false),
    });

    if (params.sender) {
        query.append("sender", params.sender);
    }

    const response = await fetch(`${BASE_URL}/quote?${query.toString()}`);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error("xBull Quote Error:", errorData);
        throw new Error(errorData.message || "Failed to fetch xBull quote");
    }

    return response.json();
}

export async function buildXBullTransaction(params: XBullAcceptQuoteParams): Promise<XBullAcceptQuoteResponse> {
    const response = await fetch(`${BASE_URL}/accept-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error("xBull Build TX Error:", errorData);
        throw new Error(errorData.message || "Failed to build xBull transaction");
    }

    return response.json();
}
