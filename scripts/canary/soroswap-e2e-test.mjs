#!/usr/bin/env node
/**
 * Soroswap API End-to-End Transaction Test
 * 
 * Simulates the full swap flow: quote → build → (unsigned XDR output)
 * Uses the canary wallet address for testing.
 */

// Canary wallet (Soroban contract address)
const CANARY_WALLET = 'CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM';

// Token contract IDs (Mainnet)
const XLM_SAC_ID = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const KALE_SAC_ID = 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV';

// Soroswap API
const SOROSWAP_API_BASE = 'https://api.soroswap.finance';
const NETWORK = 'mainnet';

// Amount: 0.5 XLM (small test amount)
const TEST_AMOUNT = 5000000; // 0.5 XLM in stroops

async function getQuote(apiKey) {
    console.log('=== Step 1: Get Quote ===\n');

    const url = `${SOROSWAP_API_BASE}/quote?network=${NETWORK}`;

    const body = {
        assetIn: XLM_SAC_ID,
        assetOut: KALE_SAC_ID,
        amount: TEST_AMOUNT,
        tradeType: 'EXACT_IN',
        protocols: ['soroswap', 'phoenix', 'aqua', 'sdex'],
        parts: 10,
        slippageBps: 100,
        maxHops: 3
    };

    console.log(`POST ${url}`);
    console.log(`Amount: 0.5 XLM (${TEST_AMOUNT.toLocaleString()} stroops)\n`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Quote failed: ${JSON.stringify(data)}`);
    }

    const amountOut = Number(data.amountOut) / 10_000_000;
    console.log(`✅ Quote received!`);
    console.log(`   Input:  0.5 XLM`);
    console.log(`   Output: ${amountOut.toFixed(7)} KALE`);
    console.log(`   Route:  ${data.routePlan?.[0]?.swapInfo?.protocol || 'unknown'}`);
    console.log(`   Impact: ${data.priceImpactPct}%\n`);

    return data;
}

async function buildTransaction(apiKey, quote) {
    console.log('=== Step 2: Build Transaction ===\n');

    const url = `${SOROSWAP_API_BASE}/quote/build?network=${NETWORK}`;

    const body = {
        quote: quote,
        from: CANARY_WALLET,
        to: CANARY_WALLET  // Same wallet for swap
    };

    console.log(`POST ${url}`);
    console.log(`From/To: ${CANARY_WALLET}\n`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        // Check for multi-step flow
        if (response.status === 428) {
            console.log('⚠️ Multi-step signing required:');
            console.log(JSON.stringify(data, null, 2));
            return { multiStep: true, data };
        }
        throw new Error(`Build failed: ${JSON.stringify(data)}`);
    }

    console.log(`✅ Transaction built!`);
    console.log(`   XDR length: ${data.xdr?.length || 0} chars`);
    console.log(`   XDR preview: ${data.xdr?.substring(0, 50)}...\n`);

    return data;
}

async function main() {
    const apiKey = process.env.PUBLIC_SOROSWAP_API_KEY || process.argv[2];

    if (!apiKey) {
        console.error('❌ No API key. Set PUBLIC_SOROSWAP_API_KEY or pass as argument.');
        process.exit(1);
    }

    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   Soroswap Swap E2E Test: XLM → KALE            ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
    console.log(`Canary Wallet: ${CANARY_WALLET}\n`);

    try {
        // Step 1: Get quote
        const quote = await getQuote(apiKey);

        // Step 2: Build transaction
        const buildResult = await buildTransaction(apiKey, quote);

        if (buildResult.xdr) {
            console.log('=== Step 3: Transaction Ready ===\n');
            console.log('The transaction XDR is now ready for signing.');
            console.log('In production, this would be signed via passkey and submitted.\n');

            // Save proof
            const proof = {
                test: 'Soroswap E2E Swap Test',
                timestamp: new Date().toISOString(),
                status: 'SUCCESS',
                wallet: CANARY_WALLET,
                quote: {
                    input: '0.5 XLM',
                    output: `${(Number(quote.amountOut) / 10_000_000).toFixed(7)} KALE`,
                    protocol: quote.routePlan?.[0]?.swapInfo?.protocol,
                    priceImpact: quote.priceImpactPct
                },
                xdrLength: buildResult.xdr.length
            };

            console.log('Proof:', JSON.stringify(proof, null, 2));

            // Write proof file
            const fs = await import('fs/promises');
            await fs.writeFile(
                'artifacts/phase-h-e2e-proof.json',
                JSON.stringify(proof, null, 2)
            );
            console.log('\n✅ Proof saved to artifacts/phase-h-e2e-proof.json');
        }

        console.log('\n✅ E2E TEST PASSED');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

main();
