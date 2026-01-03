
import { rpc, Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const SMOL_ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
const HORIZON_URL = 'https://horizon.stellar.org';

async function main() {
    const server = new Horizon.Server(HORIZON_URL);
    console.log(`Scanning Smol Issuer ${SMOL_ISSUER} Ops (Limit 50)...`);

    try {
        const ops = await server.operations()
            .forAccount(SMOL_ISSUER)
            .order('desc')
            .limit(50)
            .call();

        console.log(`Found ${ops.records.length} operations. Decoding...`);

        for (const op of ops.records) {
            if (op.type === 'invoke_host_function' || op.type_i === 24) {
                try {
                    // We need the envelope to decode function name
                    const tx = await op.transaction();
                    const envelope = xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
                    let innerTx;
                    if (envelope.switch().name === 'envelopeTypeTxFeeBump') {
                        innerTx = envelope.feeBump().tx().innerTx().v1().tx();
                    } else if (envelope.switch().name === 'envelopeTypeTx') {
                        innerTx = envelope.v1().tx();
                    }

                    if (innerTx) {
                        const operations = innerTx.operations();
                        // Find the invoke op (might not be index 0 if batch)
                        // But usually 1 op per tx.
                        for (const operation of operations) {
                            if (operation.body().switch().name === 'invokeHostFunction') {
                                const func = operation.body().invokeHostFunctionOp().hostFunction();
                                if (func.switch().name === 'hostFunctionTypeInvokeContract') {
                                    const invokeDetails = func.invokeContract();
                                    const funcName = invokeDetails.functionName().toString();

                                    // Filter Noise
                                    if (['harvest', 'plant', 'work'].includes(funcName)) continue;

                                    console.log('---------------------------------------------------');
                                    console.log(`Function: ${funcName}`);
                                    console.log(`Time: ${op.created_at}`);
                                    console.log(`Tx: ${op.transaction_hash}`);
                                    console.log(`Source (User): ${op.source_account || op.from || 'Unknown'}`);

                                    if (funcName === 'coin_it') {
                                        console.log('*** FOUND MINT! ***');
                                        const args = invokeDetails.args();
                                        try {
                                            const user = scValToNative(args[0]);
                                            console.log('Minter Arg:', user);
                                            const saltNative = scValToNative(args[2]);
                                            let hexId = '';
                                            if (Buffer.isBuffer(saltNative) || saltNative instanceof Uint8Array) {
                                                hexId = Buffer.from(saltNative).toString('hex');
                                            } else {
                                                hexId = String(saltNative);
                                            }
                                            console.log('Song ID:', hexId);
                                        } catch (e) { console.log('Decode err:', e.message); }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) { console.log('Decode Error:', e.message); }
            }
        }
    } catch (e) { console.log('Ops Error:', e.message); }
}

main().catch(console.error);
