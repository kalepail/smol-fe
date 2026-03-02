/**
 * Soroswap SDK Quote Test - Phase H (Fixed)
 * 
 * Purpose: Use soroswap-router-sdk to get optimal swap route and quote.
 * 
 * Usage:
 *   node scripts/canary/soroswap-sdk-quote.mjs <AMOUNT_XLM>
 * 
 * Example:
 *   node scripts/canary/soroswap-sdk-quote.mjs 1  # Quote 1 XLM -> KALE
 */

import { Router, CurrencyAmount, Token, Protocols, Networks } from 'soroswap-router-sdk';

// === CONFIG (Mainnet) ===
const NETWORK = Networks.PUBLIC; // 'Public Global Stellar Network ; September 2015'

// Asset Contract IDs
const XLM_SAC_ID = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const KALE_SAC_ID = 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV';

async function main() {
    const amountXlm = parseFloat(process.argv[2] || '1');
    const amountStroops = BigInt(Math.floor(amountXlm * 10_000_000));

    console.log('\n=== Soroswap SDK Quote Test ===');
    console.log('Network:', NETWORK);
    console.log('Path: XLM -> KALE');
    console.log('Amount In:', amountXlm, 'XLM');
    console.log('');

    // Create token definitions
    const xlmToken = new Token(
        NETWORK,
        XLM_SAC_ID,
        7,      // decimals
        'XLM',  // symbol
        'Stellar Lumens' // name
    );

    const kaleToken = new Token(
        NETWORK,
        KALE_SAC_ID,
        7,      // decimals
        'KALE', // symbol
        'Kale'  // name
    );

    // Create currency amount for input
    const inputAmount = CurrencyAmount.fromRawAmount(xlmToken, amountStroops.toString());

    console.log('Initializing Router...');

    // Initialize router with simplified options
    const router = new Router({
        network: NETWORK,
        protocols: [Protocols.SOROSWAP], // Use Soroswap AMM pools
    });

    console.log('Finding best route with routeExactIn...');

    try {
        // Get optimal route for exact input
        const trade = await router.routeExactIn(
            inputAmount,
            kaleToken
        );

        if (!trade) {
            console.log('No trade found! Pool may not exist for XLM/KALE pair.');
            return;
        }

        console.log('\n=== Quote Result ===');
        console.log('Trade found!');

        // Log available properties
        console.log('Trade keys:', Object.keys(trade));

        if (trade.inputAmount) {
            console.log('Input:', trade.inputAmount.toSignificant(7), 'XLM');
        }
        if (trade.outputAmount) {
            console.log('Output:', trade.outputAmount.toSignificant(7), 'KALE');
        }
        if (trade.priceImpact) {
            console.log('Price Impact:', trade.priceImpact.toSignificant(2), '%');
        }
        if (trade.route) {
            console.log('Route path:', trade.route.path?.map(t => t.symbol).join(' -> '));
        }

    } catch (err) {
        console.error('Error:', err.message);
        console.log('\nStack:', err.stack);
    }

    console.log('\n=== Complete ===');
}

main().catch(console.error);
