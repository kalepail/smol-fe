export const prerender = false;

import type { APIContext } from 'astro';

const SOROSWAP_API_URL = 'https://api.soroswap.finance';
const SUPPORTED_PROTOCOLS = ['soroswap', 'aqua', 'phoenix'];

export async function POST({ request, locals }: APIContext) {
    try {
        const body = await request.json();
        const { tokenIn, tokenOut, amountIn, slippageBps = 500 } = body;

        if (!tokenIn || !tokenOut || !amountIn) {
            return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 });
        }

        // Use env variable for API key (Cloudflare Secret)
        // Checking both runtime.env (Cloudflare) and process.env (local dev)
        const env = (locals as any).runtime?.env;
        const apiKey = env?.SOROSWAP_API_KEY || process.env.SOROSWAP_API_KEY ||
            env?.PUBLIC_SOROSWAP_API_KEY || process.env.PUBLIC_SOROSWAP_API_KEY;

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Key' }), { status: 500 });
        }

        const quotePayload = {
            assetIn: tokenIn,
            assetOut: tokenOut,
            amount: amountIn,
            tradeType: 'EXACT_IN',
            protocols: SUPPORTED_PROTOCOLS,
            slippageBps,
        };

        const response = await fetch(`${SOROSWAP_API_URL}/quote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(quotePayload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Soroswap quote failed:', response.status, errorText);
            return new Response(JSON.stringify({ error: `Soroswap API error: ${errorText}` }), { status: response.status });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}
