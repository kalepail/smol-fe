/**
 * Canary Test Harness - Phase C
 * 
 * Purpose: Validate OZ Relayer path with read-only operations first.
 * 
 * Usage:
 *   node scripts/canary/balance-check.mjs <CONTRACT_ADDRESS>
 * 
 * Example:
 *   node scripts/canary/balance-check.mjs CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
 */

import { Contract, Address, nativeToScVal } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

// === CONFIG ===
const RPC_URL = process.env.PUBLIC_RPC_URL || 'https://rpc.ankr.com/stellar_soroban';
const NETWORK_PASSPHRASE = process.env.PUBLIC_NETWORK_PASSPHRASE || 'Public Global Stellar Network ; September 2015';

// Stellar Asset Contract IDs (Mainnet)
const XLM_SAC_ID = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const KALE_SAC_ID = process.env.PUBLIC_KALE_SAC_ID || 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV';

// === MAIN ===
async function main() {
    const contractAddress = process.argv[2];

    if (!contractAddress) {
        console.log('Usage: node scripts/canary/balance-check.mjs <CONTRACT_ADDRESS>');
        console.log('\nExample addresses:');
        console.log('  - Your passkey wallet (C...)');
        console.log('  - XLM SAC:', XLM_SAC_ID);
        console.log('  - KALE SAC:', KALE_SAC_ID);
        process.exit(1);
    }

    console.log('\n=== Canary Balance Check ===');
    console.log('RPC:', RPC_URL);
    console.log('Network:', NETWORK_PASSPHRASE);
    console.log('Target:', contractAddress);
    console.log('');

    const server = new Server(RPC_URL);

    // Query XLM balance
    console.log('Querying XLM balance...');
    try {
        const xlmBalance = await queryTokenBalance(server, XLM_SAC_ID, contractAddress);
        console.log(`XLM Balance: ${formatStroops(xlmBalance)} XLM`);
    } catch (err) {
        console.log(`XLM Balance: ERROR - ${err.message}`);
    }

    // Query KALE balance
    console.log('Querying KALE balance...');
    try {
        const kaleBalance = await queryTokenBalance(server, KALE_SAC_ID, contractAddress);
        console.log(`KALE Balance: ${formatStroops(kaleBalance)} KALE`);
    } catch (err) {
        console.log(`KALE Balance: ERROR - ${err.message}`);
    }

    console.log('\n=== Complete ===');
}

/**
 * Query token balance via SAC contract
 */
async function queryTokenBalance(server, tokenContractId, ownerAddress) {
    const contract = new Contract(tokenContractId);

    // Build the address ScVal properly
    const addressScVal = new Address(ownerAddress).toScVal();

    // Build balance query - contract.call returns an Operation, not a callable
    // We need to build a full transaction for simulation
    const { TransactionBuilder, Networks } = await import('@stellar/stellar-sdk');

    // Create a dummy source account for simulation (doesn't need to exist on-chain for simulate)
    const sourceAccount = {
        accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        sequenceNumber: () => '0',
        incrementSequenceNumber: () => { }
    };

    const tx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(contract.call('balance', addressScVal))
        .setTimeout(30)
        .build();

    // Simulate (read-only)
    const result = await server.simulateTransaction(tx);

    if (result.error) {
        throw new Error(result.error);
    }

    // Extract balance from result
    // SAC balance returns i128 as xdr
    if (!result.result || !result.result.retval) {
        return 0n;
    }

    // Parse the i128 value from the result
    // Path discovered via debug: retval._value._attributes.lo._value
    const retval = result.result.retval;
    try {
        const hi = BigInt(retval._value._attributes.hi._value || 0);
        const lo = BigInt(retval._value._attributes.lo._value || 0);
        return (hi << 64n) + lo;
    } catch (e) {
        console.log('Parse error:', e.message);
        return 0n;
    }
}

/**
 * Format stroops (7 decimals) to human readable
 */
function formatStroops(stroops) {
    const value = Number(stroops) / 10_000_000;
    return value.toFixed(7);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
