
import { rpc, Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const LAUNCHTUBE = 'GDCVCUILOYWQHN3ROTPPQ37EOMKWTFE5F54UECPG6XKRGN7OTVB4EO6Q';
const HORIZON_URL = 'https://horizon.stellar.org';
const TARGET_TIME = new Date('2026-01-03T05:59:00Z').getTime(); // 1 minute before "done"

async function main() {
    const server = new Horizon.Server(HORIZON_URL);
    console.log(`Paging LaunchTube operations until ${new Date(TARGET_TIME).toISOString()}...`);

    let cursor;
    let recordsFound = 0;

    // Filter out KALE spam
    const IGNORE = new Set(['harvest', 'plant', 'work', 'transfer', 'approve']);

    while (true) {
        let builder = server.operations().forAccount(LAUNCHTUBE).order('desc').limit(200);
        if (cursor) builder = builder.cursor(cursor);

        const response = await builder.call();
        if (response.records.length === 0) break;

        recordsFound += response.records.length;
        console.log(`Scanned ${recordsFound} ops. Current oldest: ${response.records[response.records.length - 1].created_at}`);

        for (const record of response.records) {
            const opTime = new Date(record.created_at).getTime();
            if (opTime < TARGET_TIME) {
                console.log('Reached target time window. Stopping.');
                return;
            }

            if (record.type === 'invoke_host_function' || record.type_i === 24) {
                try {
                    const tx = await record.transaction();
                    const envelope = xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
                    let innerTx;
                    if (envelope.switch().name === 'envelopeTypeTxFeeBump') {
                        innerTx = envelope.feeBump().tx().innerTx().v1().tx();
                    } else if (envelope.switch().name === 'envelopeTypeTx') {
                        innerTx = envelope.v1().tx();
                    }

                    if (innerTx) {
                        const ops = innerTx.operations();
                        for (const op of ops) {
                            if (op.body().switch().name === 'invokeHostFunction') {
                                const func = op.body().invokeHostFunctionOp().hostFunction();
                                if (func.switch().name === 'hostFunctionTypeInvokeContract') {
                                    const invokeDetails = func.invokeContract();
                                    const funcName = invokeDetails.functionName().toString();

                                    if (!IGNORE.has(funcName)) {
                                        if (funcName === 'coin_it') {
                                            console.log('---------------------------------------------------');
                                            console.log(`*** FOUND MINT (coin_it)! ***`);
                                            console.log(`Time: ${record.created_at}`);
                                            console.log(`Tx: ${record.transaction_hash}`);

                                            const args = invokeDetails.args();
                                            try {
                                                const user = scValToNative(args[0]);
                                                console.log('Minter:', user);
                                                const saltNative = scValToNative(args[2]);
                                                let hexId = '';
                                                if (Buffer.isBuffer(saltNative) || saltNative instanceof Uint8Array) {
                                                    hexId = Buffer.from(saltNative).toString('hex');
                                                } else {
                                                    hexId = String(saltNative);
                                                }
                                                console.log('Song ID:', hexId);

                                                // Optional: Check if we want to stop after finding one? 
                                                // Let's keep scanning in case there are multiple (failed/retries)

                                            } catch (e) { }
                                        } else {
                                            console.log(`Ignored Func: ${funcName} at ${record.created_at}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) { }
            }
        }

        cursor = response.records[response.records.length - 1].paging_token;
    }
}

main().catch(console.error);
