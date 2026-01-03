
import { rpc, Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const LAUNCHTUBE = 'GDCVCUILOYWQHN3ROTPPQ37EOMKWTFE5F54UECPG6XKRGN7OTVB4EO6Q';
const HORIZON_URL = 'https://horizon.stellar.org';

async function main() {
    const server = new Horizon.Server(HORIZON_URL);
    console.log(`Deep & Filtered scanning ${LAUNCHTUBE} (Limit 200)...`);

    // Paging: We might need to page if 200 is not enough, but 200 is max limit per call.
    const response = await server.operations()
        .forAccount(LAUNCHTUBE)
        .order('desc')
        .limit(200)
        .call();

    console.log(`Found ${response.records.length} operations.`);
    let found = false;

    // Filter out common KALE spam functions
    const IGNORE_FUNCS = new Set(['harvest', 'plant', 'work', 'transfer', 'approve']);

    for (const record of response.records) {
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

                                if (!IGNORE_FUNCS.has(funcName)) {
                                    console.log('---------------------------------------------------');
                                    console.log(`Func: ${funcName} | Time: ${record.created_at}`);
                                    console.log(`Tx: ${record.transaction_hash}`);

                                    if (funcName === 'coin_it' || funcName === 'mint') {
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
                                            found = true;
                                        } catch (e) { console.log('Decode err:', e.message); }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) { }
        }
    }

    if (!found) console.log('No interesting transactions found in last 200 operations.');
}

main().catch(console.error);
