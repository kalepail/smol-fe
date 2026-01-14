#!/usr/bin/env node
/**
 * Soroswap API Aggregator Quote Test
 * 
 * Tests the Soroswap API for XLM → KALE routes across ALL protocols:
 * - soroswap (AMM)
 * - phoenix
 * - aqua
 * - sdex (Stellar Classic DEX order books)
 * 
 * The aggregator finds the best route from any available source.
 */

// Token contract IDs (Mainnet)
const XLM_SAC_ID = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const KALE_SAC_ID = 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV';

// Soroswap API configuration
const SOROSWAP_API_BASE = 'https://api.soroswap.finance';
const NETWORK = 'mainnet';

// Amount to quote (1 XLM in stroops = 10,000,000)
const QUOTE_AMOUNT = 10000000;

async function getQuote(apiKey) {
    console.log('=== Soroswap API Aggregator Quote Test ===\n');
    console.log('Testing XLM → KALE route discovery across ALL protocols...');
    console.log(`Input: 1 XLM (${QUOTE_AMOUNT.toLocaleString()} stroops)`);
    console.log(`Network: ${NETWORK}\n`);

    const quoteUrl = `${SOROSWAP_API_BASE}/quote?network=${NETWORK}`;

    // Request body per OpenAPI spec
    const body = {
        assetIn: XLM_SAC_ID,
        assetOut: KALE_SAC_ID,
        amount: QUOTE_AMOUNT,
        tradeType: 'EXACT_IN',
        // Query ALL protocols to find any route
        protocols: ['soroswap', 'phoenix', 'aqua', 'sdex'],
        parts: 10,
        slippageBps: 100, // 1% slippage
        maxHops: 3
    };

    console.log(`POST ${quoteUrl}`);
    console.log(`Body: ${JSON.stringify(body, null, 2)}\n`);

    const headers = {
        'Content-Type': 'application/json'
    };

    // Add auth if API key provided
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        console.log('✅ Using API key authentication\n');
    } else {
        console.log('⚠️ No API key - trying without auth...\n');
    }

    try {
        const response = await fetch(quoteUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        console.log(`Status: ${response.status} ${response.statusText}`);

        const data = await response.json();

        if (!response.ok) {
            console.error(`\n❌ Error: ${JSON.stringify(data, null, 2)}`);
            return null;
        }

        console.log('\n=== Quote Response ===');
        console.log(JSON.stringify(data, null, 2));

        // Parse and display key info
        if (data.amountOut) {
            const amountOutKale = Number(data.amountOut) / 10_000_000;
            console.log(`\n📊 Quote Summary:`);
            console.log(`   Input:  1 XLM`);
            console.log(`   Output: ${amountOutKale.toFixed(7)} KALE`);
        }

        // Show platform used
        if (data.platform) {
            console.log(`   Platform: ${data.platform}`);
        }

        // Show route plan with protocols
        if (data.routePlan && data.routePlan.length > 0) {
            console.log(`\n🛣️ Route Plan:`);
            data.routePlan.forEach((step, i) => {
                const protocol = step.swapInfo?.protocol || 'unknown';
                const percent = step.percent || '100';
                const path = step.swapInfo?.path || [];
                console.log(`   Step ${i + 1}: ${protocol} (${percent}%)`);
                if (path.length > 0) {
                    console.log(`           Path: ${path.length} hops`);
                }
            });
        }

        // Price impact
        if (data.priceImpactPct) {
            console.log(`\n💹 Price Impact: ${data.priceImpactPct}%`);
        }

        return data;

    } catch (error) {
        console.error(`\n❌ Request failed: ${error.message}`);
        return null;
    }
}

// Also check available protocols on mainnet
async function checkProtocols() {
    console.log('\n\n=== Checking Available Protocols ===\n');

    const url = `${SOROSWAP_API_BASE}/protocols?network=${NETWORK}`;
    console.log(`GET ${url}\n`);

    try {
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            console.log('Available protocols on mainnet:');
            console.log(data);
            return data;
        } else {
            console.log(`Status: ${response.status}`);
        }
    } catch (error) {
        console.log(`Check skipped: ${error.message}`);
    }

    return null;
}

async function main() {
    // Get API key from env or args
    const apiKey = process.env.PUBLIC_SOROSWAP_API_KEY || process.argv[2];

    if (!apiKey) {
        console.log('⚠️ No API key provided. Set PUBLIC_SOROSWAP_API_KEY or pass as argument.');
        console.log('Get a free API key at: https://api.soroswap.finance/login\n');
    }

    // First check what protocols are available
    await checkProtocols();

    // Then get the quote
    const quote = await getQuote(apiKey);

    if (quote) {
        console.log('\n\n✅ SUCCESS: XLM→KALE route exists!');
        console.log('The aggregator found a route via one or more protocols.');
    } else {
        console.log('\n\n❌ FAILED: No XLM→KALE route found.');
        console.log('Possible causes:');
        console.log('  - API key required for quote endpoint');
        console.log('  - No liquidity for XLM/KALE on any protocol');
    }

    console.log('\n=== Test Complete ===');
}

main().catch(console.error);
