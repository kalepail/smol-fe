
import { Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
const HORIZON_URL = 'https://horizon.stellar.org';
const API_BASE = 'https://api.smol.xyz';
const CHECK_INTERVAL = 5000;

async function main() {
    console.log(`📡 SMOL MONITOR: MINTS + PUBLISHES`);
    console.log(`Watching Issuer: ${ISSUER}`);
    console.log(`Polling API: ${API_BASE} (Publish Detection)`);
    console.log(`Waiting for activity... (Ctrl+C to stop)`);

    // --- STATE ---
    const server = new Horizon.Server(HORIZON_URL);
    const seenTxs = new Set();
    let knownPublicIds = new Set();
    let isFirstApiRun = true;

    while (true) {

        // --- 1. MINT MONITOR (Blockchain) ---
        try {
            const ops = await server.operations()
                .forAccount(ISSUER)
                .order('desc')
                .limit(10)
                .call();

            const newMints = [];

            for (const op of ops.records) {
                if (seenTxs.has(op.transaction_hash)) continue;
                seenTxs.add(op.transaction_hash);

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
                                    const funcName = operation.body().invokeHostFunctionOp().hostFunction().invokeContract().functionName().toString();
                                    if (funcName === 'coin_it') {
                                        const args = operation.body().invokeHostFunctionOp().hostFunction().invokeContract().args();
                                        const user = scValToNative(args[0]);
                                        const saltNative = scValToNative(args[2]);
                                        const hexId = Buffer.isBuffer(saltNative) ? Buffer.from(saltNative).toString('hex') : String(saltNative);

                                        newMints.push({ tx: op.transaction_hash, time: op.created_at, id: hexId, user: user });
                                    }
                                }
                            }
                        }
                    } catch (e) { }
                }
            }

            // Process Mints
            for (const mint of newMints) {
                const meta = await fetchMetadata(mint.id);
                console.log('\n======================================================');
                console.log('🚨  NEW LIVE MINT DETECTED!  🚨');
                console.log('======================================================');
                console.log(`🎵  TITLE:    ${meta.title}`);
                console.log(`🆔  SONG ID:  ${mint.id}`);
                console.log(`👤  MINTER:   ${mint.user}`);
                console.log(`🔗  LINK:     https://smol.xyz/${mint.id}`);
                console.log(`🏷️   TAGS:     ${meta.tags.join(', ')}`);
                console.log(`📜  LYRICS:   ${meta.lyrics.slice(0, 50).replace(/\n/g, ' ')}...`);
                console.log(`🔗  TX:       ${mint.tx}`);
                console.log('======================================================');
            }

        } catch (e) {
            // console.log('Mint Poll Error:', e.message); 
        }


        // --- 2. PUBLISH MONITOR (API) ---
        try {
            const res = await fetch(`${API_BASE}/?limit=50`);
            if (res.ok) {
                const json = await res.json();
                const liveSmols = json.smols || [];
                const currentIds = new Set(liveSmols.map(s => s.Id));

                if (isFirstApiRun) {
                    knownPublicIds = currentIds;
                    isFirstApiRun = false;
                } else {
                    // Find new IDs
                    const newPublishes = liveSmols.filter(s => !knownPublicIds.has(s.Id));

                    for (const s of newPublishes) {
                        knownPublicIds.add(s.Id); // Add to known so we don't spam

                        console.log('\n++++++++++++++++++++++++++++++++++++++++++++++++++++++');
                        console.log('📢  NEW SONG PUBLISHED!  📢');
                        console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++');
                        console.log(`🎵  TITLE:    ${s.Title}`);
                        console.log(`🆔  SONG ID:  ${s.Id}`);
                        console.log(`🔗  LINK:     https://smol.xyz/${s.Id}`);
                        console.log(`⏰  CREATED:  ${s.Created_At}`);
                        console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++');
                    }
                }
            }
        } catch (e) {
            // console.log('API Poll Error:', e.message);
        }

        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
    }
}

async function fetchMetadata(id) {
    try {
        const res = await fetch(`${API_BASE}/${id}`);
        if (!res.ok) return { title: 'Unknown', tags: [], lyrics: '' };
        const json = await res.json();
        const lyricData = json.kv_do?.lyrics || {};
        const payload = json.kv_do?.payload || {};
        return {
            title: json.d1?.Title || lyricData.title || 'Unknown',
            tags: lyricData.style || [],
            lyrics: lyricData.lyrics || '',
            prompt: payload.prompt || ''
        };
    } catch {
        return { title: 'Fetch Error', tags: [], lyrics: '' };
    }
}

main().catch(console.error);
