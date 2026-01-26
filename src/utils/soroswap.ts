/**
 * Soroswap API Client
 *
 * Handles communication with the Soroswap DEX Aggregator API
 * for token swaps across multiple protocols (soroswap, phoenix, aqua, sdex).
 * 
 * ADAPTED FOR SMOL-FE:
 * Uses local /api/swap/quote proxy to hide API keys (Ohloss pattern).
 */

const SOROSWAP_API_BASE = 'https://api.soroswap.finance';

export function safeStringify(obj: unknown, space?: number): string {
    return JSON.stringify(obj, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
        , space);
}

export interface QuoteRequest {
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
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
    amountOut: string;  // Changed from number to string for consistency and to avoid precision loss
    otherAmountThreshold: string;  // Changed from number to string for consistency
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

/**
 * Get a quote for a token swap
 * PROXIED: Calls /api/swap/quote to avoid exposing API Key
 */
export async function getQuote(request: QuoteRequest, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<QuoteResponse> {
    const url = '/api/swap/quote';

    const body = {
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amountIn: request.amountIn, // API expects this name
        tradeType: request.tradeType, // Critical: Missing this caused EXACT_OUT issues
        slippageBps: request.slippageBps ?? 500,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log("[SoroswapAPI] Quote Response:", safeStringify(data, 2));

    if (!response.ok) {
        throw new Error(data.error || `Quote failed: ${response.status}`);
    }

    return data as QuoteResponse;
}

/**
 * Build an unsigned transaction XDR from a quote
 * WARNING: This relies on public keys or client-side keys if used directly. 
 * Use swap-builder.ts (Ohloss logic) for C-address swaps instead.
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

    const key = import.meta.env.PUBLIC_SOROSWAP_API_KEY;
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 428) {
            throw new Error(`Multi-step signing required: ${safeStringify(data)}`);
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

    const key = import.meta.env.PUBLIC_SOROSWAP_API_KEY;
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || `Send failed: ${response.status}`);
    }

    return data as SendResponse;
}

/**
 * Token contract IDs
 */
export const TOKENS = {
    XLM: import.meta.env.PUBLIC_XLM_SAC_ID || 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
    // Verified KALE ID from Ohloss/DeFi research
    KALE: import.meta.env.PUBLIC_KALE_SAC_ID || 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV'
};

/**
 * Format stroops to human-readable token amount (7 decimals)
 * Uses BigInt arithmetic to avoid precision loss for large amounts
 */
export function formatAmount(stroops: number | string | bigint, decimals: number = 7): string {
    try {
        // Convert to BigInt if not already
        const stroopsBigInt = typeof stroops === 'bigint' ? stroops : BigInt(stroops);

        // Calculate integer and fractional parts
        const divisor = BigInt(10 ** decimals);
        const integerPart = stroopsBigInt / divisor;
        const fractionalPart = stroopsBigInt % divisor;

        // Format fractional part with leading zeros
        const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

        return `${integerPart}.${fractionalStr}`;
    } catch (error) {
        console.error('[formatAmount] Error formatting amount:', stroops, error);
        return '0';
    }
}

/**
 * Convert human amount to stroops
 * Returns a string to avoid precision loss for large amounts
 */
export function toStroops(amount: number | string, decimals: number = 7): string {
    try {
        // Convert to string and handle decimal points
        const amountStr = String(amount);
        const [integerPart, fractionalPart = ''] = amountStr.split('.');

        // Pad or trim fractional part to match decimals
        const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);

        // Combine and convert to BigInt
        const stroops = BigInt(integerPart + paddedFractional);

        return stroops.toString();
    } catch (error) {
        console.error('[toStroops] Error converting amount:', amount, error);
        return '0';
    }
}

// ============================================
// Direct Aggregator Contract Invocation
// ============================================

/**
 * Soroswap Aggregator Contract (Mainnet)
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
    amountInMax?: string; // EXACT_OUT
    amountOut?: string;    // EXACT_OUT
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
