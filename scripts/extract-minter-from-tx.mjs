#!/usr/bin/env node
/**
 * Extract minter addresses from mint transactions
 * Uses Horizon to get transaction operations and decodes the user parameter
 */

import { xdr, scValToNative, Address } from '@stellar/stellar-sdk';

const HORIZON_URL = 'https://horizon.stellar.org';
const SMOL_CONTRACT = 'CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA';

async function getTransactionOperations(txHash) {
    const res = await fetch(`${HORIZON_URL}/transactions/${txHash}/operations`);
    if (!res.ok) throw new Error(`Failed to fetch operations: ${res.status}`);
    return res.json();
}

async function getMinterFromTransaction(txHash) {
    try {
        const data = await getTransactionOperations(txHash);
        const op = data._embedded?.records?.[0];

        if (!op || op.type !== 'invoke_host_function') {
            return null;
        }

        // The first parameter is the user address for coin_it
        const firstParam = op.parameters?.[0];
        if (!firstParam || firstParam.type !== 'Address') {
            return null;
        }

        // Decode the XDR
        const scVal = xdr.ScVal.fromXDR(Buffer.from(firstParam.value, 'base64'));
        const address = scValToNative(scVal);

        return address;
    } catch (e) {
        console.error(`Error decoding tx ${txHash}:`, e.message);
        return null;
    }
}

// Test with the known transaction
async function main() {
    const testTxHash = '98bd22c0a1be925cb0c114d196dad5fbf07fcfdae4876b57c4fb7467e0e5935d';

    console.log('Testing minter extraction...');
    console.log('Transaction:', testTxHash);

    const minter = await getMinterFromTransaction(testTxHash);
    console.log('Minter extracted:', minter);
    console.log('Expected:', 'CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM');
    console.log('Match:', minter === 'CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM');
}

main().catch(console.error);
