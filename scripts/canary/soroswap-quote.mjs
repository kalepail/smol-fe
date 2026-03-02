/**
 * Soroswap Quote Test - Phase H1
 * 
 * Purpose: Get a swap quote from Soroswap Router (read-only simulation).
 * 
 * Usage:
 *   node scripts/canary/soroswap-quote.mjs <AMOUNT_IN_STROOPS>
 * 
 * Example:
 *   node scripts/canary/soroswap-quote.mjs 10000000  # Quote 1 XLM -> KALE
 */

import { Contract, Address } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

// === CONFIG ===
const RPC_URL = 'https://rpc.ankr.com/stellar_soroban';
const NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

// Soroswap Mainnet Contract IDs
const ROUTER_ID = 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH';
const XLM_SAC_ID = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const KALE_SAC_ID = 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV';

// Canary wallet for testing
const WALLET = 'CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM';

async function main() {
    const { TransactionBuilder } = await import('@stellar/stellar-sdk');

    const amountInStroops = BigInt(process.argv[2] || '10000000'); // Default 1 XLM

    console.log('\n=== Soroswap Quote Test ===');
    console.log('Router:', ROUTER_ID);
    console.log('Path: XLM -> KALE');
    console.log('Amount In:', Number(amountInStroops) / 10_000_000, 'XLM');
    console.log('');

    const server = new Server(RPC_URL);
    const router = new Contract(ROUTER_ID);

    // Build path array [XLM, KALE]
    const path = [
        new Address(XLM_SAC_ID).toScVal(),
        new Address(KALE_SAC_ID).toScVal(),
    ];

    // Build amount as i128
    const { nativeToScVal } = await import('@stellar/stellar-sdk');
    const amountScVal = nativeToScVal(amountInStroops, { type: 'i128' });

    // Create source account for simulation
    const sourceAccount = {
        accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        sequenceNumber: () => '0',
        incrementSequenceNumber: () => { }
    };

    // Build get_amounts_out call
    // Soroswap Router method: get_amounts_out(amount_in: i128, path: Vec<Address>) -> Vec<i128>
    const tx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(router.call('get_amounts_out', amountScVal, nativeToScVal(path, { type: 'Vec' })))
        .setTimeout(30)
        .build();

    console.log('Simulating get_amounts_out...');

    try {
        const result = await server.simulateTransaction(tx);

        if (result.error) {
            console.log('Simulation Error:', result.error);
            return;
        }

        console.log('\n=== Quote Result ===');

        // Parse result.result.retval (should be Vec<i128>)
        if (result.result?.retval) {
            const retval = result.result.retval;
            console.log('Raw retval:', JSON.stringify(retval, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2).slice(0, 500));

            // Try to extract amounts from Vec
            if (retval._value && Array.isArray(retval._value)) {
                const amounts = retval._value.map(v => {
                    try {
                        return BigInt(v._value._attributes.lo._value || 0);
                    } catch {
                        return 0n;
                    }
                });
                console.log('Amounts:', amounts.map(a => Number(a) / 10_000_000));
                console.log(`\nQuote: ${Number(amountInStroops) / 10_000_000} XLM -> ${Number(amounts[1] || 0n) / 10_000_000} KALE`);
            }
        } else {
            console.log('No result returned');
        }
    } catch (err) {
        console.error('Error:', err.message);
    }

    console.log('\n=== Complete ===');
}

main().catch(console.error);
