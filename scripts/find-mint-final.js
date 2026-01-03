
import { Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const REFERENCE_MINT_TOKEN = 'CDCJBMT4ISI6CILQXJMIBZTIVREUYUATLYZX5VMPWQW7I5TW3WSSORGN';
const TARGET_SONG_ID = 'ba947c49840a86da8f8a14c202df52266f1aa06a5e33ecbd537bd8ee71f01a4f';
const HORIZON_URL = 'https://horizon.stellar.org';

async function main() {
    const server = new Horizon.Server(HORIZON_URL);

    // 1. Find Active Issuer from Reference Token
    console.log(`1. Inspecting Reference Token (Two Tall Hippies): ${REFERENCE_MINT_TOKEN}...`);
    let activeIssuer = '';

    try {
        const seUrl = `https://api.stellar.expert/explorer/public/contract/${REFERENCE_MINT_TOKEN}`;
        const res = await fetch(seUrl);
        const data = await res.json();

        if (data.validation?.issuer) {
            activeIssuer = data.validation.issuer;
            console.log(`   -> Found Active Issuer: ${activeIssuer}`);
        } else {
            // Fallback: This might be the issuer directly?
            // Or we just scan the OLD issuer if this fails, but let's assume this works.
            console.log('   -> Could not determine issuer from Stellar Expert. Using default GBVJZ...');
            activeIssuer = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
        }
    } catch (e) {
        console.log(`   -> Error fetching issuer: ${e.message}. Using default.`);
        activeIssuer = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
    }

    // 2. Scan Operations for Target Mint
    console.log(`\n2. Scanning Issuer History for Target ID: ${TARGET_SONG_ID.slice(0, 10)}... (Limit 200)`);

    try {
        const ops = await server.operations()
            .forAccount(activeIssuer)
            .order('desc')
            .limit(200)
            .call();

        console.log(`   -> Fetched ${ops.records.length} operations.`);

        let found = false;

        for (const op of ops.records) {
            if (op.type === 'invoke_host_function' || op.type_i === 24) {
                try {
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
                        for (const operation of operations) {
                            if (operation.body().switch().name === 'invokeHostFunction') {
                                const func = operation.body().invokeHostFunctionOp().hostFunction();
                                if (func.switch().name === 'hostFunctionTypeInvokeContract') {
                                    const invokeDetails = func.invokeContract();
                                    const funcName = invokeDetails.functionName().toString();

                                    if (funcName === 'coin_it') {
                                        const args = invokeDetails.args();
                                        const saltNative = scValToNative(args[2]);
                                        let hexId = '';
                                        if (Buffer.isBuffer(saltNative) || saltNative instanceof Uint8Array) {
                                            hexId = Buffer.from(saltNative).toString('hex');
                                        } else {
                                            hexId = String(saltNative);
                                        }

                                        if (hexId === TARGET_SONG_ID) {
                                            const user = scValToNative(args[0]);
                                            console.log('\n---------------------------------------------------');
                                            console.log('*** FOUND TARGET MINT! ***');
                                            console.log(`Transaction Hash: ${op.transaction_hash}`);
                                            console.log(`Time: ${op.created_at}`);
                                            console.log(`Song ID: ${hexId}`);
                                            console.log(`Minter (User Address): ${user}`);
                                            console.log('---------------------------------------------------');
                                            found = true;
                                            return; // Stop after finding it
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) { }
            }
        }

        if (!found) console.log('\nTarget mint not found in last 200 operations.');

    } catch (e) { console.log('Ops Error:', e.message); }
}

main().catch(console.error);
