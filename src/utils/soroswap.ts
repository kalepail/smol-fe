/**
 * Soroswap API Client
 * 
 * Handles communication with the Soroswap DEX Aggregator API
 * for token swaps across multiple protocols (soroswap, phoenix, aqua, sdex).
 */

const SOROSWAP_API_BASE = 'https://api.soroswap.finance';

export interface QuoteRequest {
    assetIn: string;
    assetOut: string;
    amount: number;
    tradeType: 'EXACT_IN' | 'EXACT_OUT';
    protocols?: string[];
    parts?: number;
    slippageBps?: number;
    maxHops?: number;
}

export interface QuoteResponse {
    assetIn: string;
    assetOut: string;
    amountIn: string;
    amountOut: number;
    otherAmountThreshold: number;
    priceImpactPct: string;
    tradeType: string;
    platform: 'router' | 'aggregator' | 'sdex';
    rawTrade: unknown;
    routePlan: Array<{
        swapInfo: {
            protocol: string;
            path: string[];
        };
        percent: string;
    }>;
}

export interface BuildRequest {
    quote: QuoteResponse;
    from: string;
    to: string;
}

export interface BuildResponse {
    xdr: string;
}

export interface SendRequest {
    xdr: string;
    launchtube?: boolean;
}

export interface SendResponse {
    hash: string;
    status: string;
}

function getApiKey(): string {
    const key = import.meta.env.PUBLIC_SOROSWAP_API_KEY;
    if (!key) {
        throw new Error('Soroswap API key not configured (PUBLIC_SOROSWAP_API_KEY)');
    }
    return key;
}

function getHeaders(): HeadersInit {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`
    };
}

/**
 * Get a quote for a token swap
 */
export async function getQuote(request: QuoteRequest, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<QuoteResponse> {
    const url = `${SOROSWAP_API_BASE}/quote?network=${network}`;

    const body = {
        assetIn: request.assetIn,
        assetOut: request.assetOut,
        amount: request.amount,
        tradeType: request.tradeType,
        // Default protocols (Factory Spec: Exact match to ohloss/api-worker)
        protocols: request.protocols ?? ['soroswap', 'aqua', 'phoenix'],
        parts: request.parts ?? 10,
        slippageBps: request.slippageBps ?? 500, // 5% default (matches ohloss reference)
        maxHops: request.maxHops ?? 3
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log("[SoroswapAPI] Quote Response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
        throw new Error(data.message || `Quote failed: ${response.status}`);
    }

    return data as QuoteResponse;
}

/**
 * Build an unsigned transaction XDR from a quote
 */
export async function buildTransaction(
    quote: QuoteResponse,
    from: string,
    to: string,
    network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<BuildResponse> {
    const url = `${SOROSWAP_API_BASE}/quote/build?network=${network}`;

    const body: BuildRequest = {
        quote,
        from,
        to
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        // Check for multi-step flow (428 = needs user signature first)
        if (response.status === 428) {
            throw new Error(`Multi-step signing required: ${JSON.stringify(data)}`);
        }
        throw new Error(data.message || `Build failed: ${response.status}`);
    }

    return data as BuildResponse;
}

/**
 * Submit a signed transaction XDR
 */
export async function sendTransaction(
    signedXdr: string,
    useLaunchtube: boolean = false,
    network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<SendResponse> {
    const url = `${SOROSWAP_API_BASE}/send?network=${network}`;

    const body: SendRequest = {
        xdr: signedXdr,
        launchtube: useLaunchtube
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || `Send failed: ${response.status}`);
    }

    return data as SendResponse;
}

/**
 * Token contract IDs for convenience
 */
export const TOKENS = {
    XLM: import.meta.env.PUBLIC_XLM_SAC_ID || 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
    KALE: import.meta.env.PUBLIC_KALE_SAC_ID || 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV'
};

/**
 * Format stroops to human-readable token amount (7 decimals)
 */
export function formatAmount(stroops: number | string, decimals: number = 7): string {
    const value = Number(stroops) / Math.pow(10, decimals);
    return value.toFixed(decimals);
}

/**
 * Convert human amount to stroops
 */
export function toStroops(amount: number | string, decimals: number = 7): number {
    return Math.floor(Number(amount) * Math.pow(10, decimals));
}

// ============================================
// Direct Aggregator Contract Invocation
// ============================================

/**
 * Soroswap Aggregator Contract (Mainnet)
 * Uses environment variable for consistency
 */
export const AGGREGATOR_CONTRACT = import.meta.env.PUBLIC_AGGREGATOR_CONTRACT_ID || 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH';

/**
 * RawTrade distribution from quote
 */
export interface RawTradeDistribution {
    protocol_id: string;
    path: string[];
    parts: number;
    is_exact_in: boolean;
}

export interface RawTrade {
    amountIn: string;
    amountOutMin: string;
    distribution: RawTradeDistribution[];
}

/**
 * Parse rawTrade from quote response
 */
export function parseRawTrade(quote: QuoteResponse): RawTrade {
    const raw = quote.rawTrade as RawTrade;
    if (!raw || !raw.distribution) {
        throw new Error('Quote does not contain valid rawTrade distribution');
    }
    return raw;
}

/**
 * Get deadline (current ledger + buffer)
 */
export function getDeadline(bufferLedgers: number = 300): bigint {
    // Use a timestamp-based deadline (Unix seconds + buffer)
    return BigInt(Math.floor(Date.now() / 1000) + bufferLedgers);
}
