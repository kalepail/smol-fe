
import { rpc, Horizon, scValToNative, xdr, nativeToScVal } from '@stellar/stellar-sdk';

const KALE_SAC = 'CAS3J7GYLGXMF6TDJBBYABC3M2OX6COCCFDDB6J6W3F7X47X62N3C4A5';
const RPC_URL = 'https://rpc.lightsail.network/';

async function rpcCall(method, params = {}) {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        })
    });
    const data = await res.json();
    if (data.error) {
        // console.log(JSON.stringify(data.error));
        // Ignore ledger range error early on
        if (data.error.code === -32600) throw new Error('Ledger Range Error');
        throw new Error(JSON.stringify(data.error));
    }
    return data.result;
}

async function getLatestLedger() {
    const result = await rpcCall('getLatestLedger');
    return result.sequence;
}

async function getEvents(startLedger, cursor = null) {
    // Create topic: Symbol('transfer')
    // Correct way in many versions: xdr.ScVal.scvSymbol('transfer')
    // Or nativeToScVal('transfer', { type: 'symbol' })

    let topic0;
    try {
        topic0 = xdr.ScVal.scvSymbol('transfer').toXDR('base64');
    } catch (e) {
        // Fallback or debug
        // Try nativeToScVal if imported
        topic0 = nativeToScVal('transfer', { type: 'symbol' }).toXDR('base64');
    }

    const params = {
        startLedger,
        filters: [{
            type: 'contract',
            contractIds: [KALE_SAC],
            topics: [[topic0]]
        }],
        pagination: { limit: 100 }
    };
    if (cursor) params.pagination.cursor = cursor;
    return rpcCall('getEvents', params);
}

async function main() {
    console.log(`Scanning KALE SAC (${KALE_SAC}) for transfers to Contracts...`);

    try {
        const latest = await getLatestLedger();
        const start = latest - 2000; // Last ~2 hours
        console.log(`Scanning ledgers ${start} to ${latest}...`);

        let cursor = null;
        let found = 0;

        while (true) {
            let res;
            try {
                res = await getEvents(start, cursor);
            } catch (e) {
                console.log('GetEvents Error:', e.message);
                break;
            }

            const events = res.events || [];

            for (const event of events) {
                try {
                    const topics = event.topic;
                    if (topics.length >= 3) {
                        const toVal = xdr.ScVal.fromXDR(topics[2], 'base64');
                        const toNative = scValToNative(toVal);

                        if (typeof toNative === 'string' && toNative.startsWith('C')) {
                            const fromVal = xdr.ScVal.fromXDR(topics[1], 'base64');
                            const fromNative = scValToNative(fromVal);

                            console.log(`---------------------------------------------------`);
                            console.log(`Time: ${event.ledgerClosedAt}`);
                            console.log(`Tx: ${event.txHash}`);
                            console.log(`From (User): ${fromNative}`);
                            console.log(`To (Contract): ${toNative}`);

                            if (toNative !== KALE_SAC) {
                                console.log(`*** CANDIDATE CONTRACT: ${toNative} ***`);
                                found++;
                            }
                        }
                    }
                } catch (e) { }
            }

            if (events.length < 100) break;
            cursor = res.cursor;
            if (!cursor) break;
        }

        if (found === 0) console.log('No transfers to contracts found.');

    } catch (e) {
        console.log('Error:', e.message);
    }
}

main().catch(console.error);
