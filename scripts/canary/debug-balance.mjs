/**
 * Debug Balance Query - Check SAC response structure
 */

import { Contract, Address } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

const RPC_URL = 'https://rpc.ankr.com/stellar_soroban';
const NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const KALE_SAC_ID = 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV';
const WALLET = 'CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM';

async function main() {
    const { TransactionBuilder } = await import('@stellar/stellar-sdk');
    const server = new Server(RPC_URL);
    const contract = new Contract(KALE_SAC_ID);
    const addressScVal = new Address(WALLET).toScVal();

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

    console.log('Simulating balance query...');
    const result = await server.simulateTransaction(tx);

    console.log('\n=== Raw Response ===');
    console.log(JSON.stringify(result, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2));

    // Check different paths to the result
    console.log('\n=== Path Analysis ===');
    console.log('result.result:', result.result);
    console.log('result.results:', result.results);

    if (result.result) {
        console.log('result.result.retval:', result.result.retval);
    }

    // Try the scVal() parsing if available
    if (result.result?.retval) {
        const retval = result.result.retval;
        console.log('retval type:', typeof retval);
        console.log('retval keys:', Object.keys(retval));

        // Try scVal method
        if (typeof retval.value === 'function') {
            const scVal = retval.value();
            console.log('scVal:', scVal);
        }
    }
}

main().catch(console.error);
