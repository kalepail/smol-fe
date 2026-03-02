
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const API_BASE = 'https://api.smol.xyz';
const ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
const HORIZON_URL = 'https://horizon.stellar.org';
const OUTPUT_FILE = path.join(__dirname, '../public/data/GalacticSnapshot.json');
const CONCURRENCY = 20; // Parallel fetches

// --- HELPERS ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return await res.json();
        } catch (e) {
            if (i === retries - 1) throw e;
            await sleep(1000 * (i + 1));
        }
    }
}

// --- PHASE 1: BLOCKCHAIN SCAN (MINTERS) ---
async function scanBlockchain() {
    console.log(`\n[PHASE 1] Scanning Blockchain (Issuer: ${ISSUER})...`);
    const server = new Horizon.Server(HORIZON_URL);
    const minterMap = new Map(); // SongID -> { Minter, Tx, Time }

    let cursor = 'now';
    let count = 0;

    try {
        let hasMore = true;
        let page = 0;

        // LIMIT: 500 pages * 200 ops = 100,000 ops (Deep History)
        while (hasMore && page < 500) {
            const resp = await server.operations()
                .forAccount(ISSUER)
                .order('desc')
                .limit(200)
                .cursor(cursor === 'now' ? undefined : cursor)
                .call();

            if (resp.records.length === 0) break;

            for (const op of resp.records) {
                if (op.type === 'invoke_host_function' || op.type_i === 24) {
                    try {
                        const tx = await op.transaction();
                        const envelope = xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
                        let innerTx = (envelope.switch().name === 'envelopeTypeTxFeeBump')
                            ? envelope.feeBump().tx().innerTx().v1().tx()
                            : envelope.v1().tx();

                        if (innerTx) {
                            for (const operation of innerTx.operations()) {
                                if (operation.body().switch().name === 'invokeHostFunction') {
                                    const invoke = operation.body().invokeHostFunctionOp().hostFunction().invokeContract();
                                    if (invoke.functionName().toString() === 'coin_it') {
                                        const args = invoke.args();
                                        const user = scValToNative(args[0]);
                                        const saltNative = scValToNative(args[2]);
                                        const hexId = Buffer.isBuffer(saltNative) ? Buffer.from(saltNative).toString('hex') : String(saltNative);

                                        if (!minterMap.has(hexId)) {
                                            minterMap.set(hexId, {
                                                minter: user,
                                                tx: op.transaction_hash,
                                                time: op.created_at
                                            });
                                            count++;
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) { }
                }
                cursor = op.paging_token;
            }

            process.stdout.write(`\rScanned Page ${page + 1} (Found ${count} mints)...`);
            page++;
            if (resp.records.length > 0) {
                cursor = resp.records[resp.records.length - 1].paging_token;
            } else {
                break;
            }
        }
    } catch (e) {
        console.log(`\nBlockchain scan pause/error: ${e.message}`);
    }

    console.log(`\nBlockchain Scan Complete. Found Minter info for ${minterMap.size} songs.`);
    return minterMap;
}

// --- PHASE 2: API LIST SCAN ---
async function scanApiList() {
    console.log(`\n[PHASE 2] Crawling API List...`);
    let allSmols = [];
    let cursor = null;
    let page = 1;

    while (true) {
        let url = `${API_BASE}/?limit=100`;
        if (cursor) url += `&cursor=${cursor}`;

        try {
            const data = await fetchWithRetry(url);
            const batch = data.smols || [];
            if (batch.length === 0) break;

            allSmols = allSmols.concat(batch);
            process.stdout.write(`\rFetched Page ${page} (Total: ${allSmols.length})...`);

            if (data.pagination && data.pagination.nextCursor) {
                cursor = data.pagination.nextCursor;
            } else {
                break;
            }
            page++;
            if (allSmols.length > 10000) break; // Increased safety limit
        } catch (e) {
            console.log(`\nAPI List Error: ${e.message}`);
            break;
        }
    }
    console.log(`\nAPI Crawl Complete. Found ${allSmols.length} public smols.`);
    return allSmols;
}

// --- PHASE 3: HYDRATION ---
async function hydrateDetails(smolList, minterMap, previousState) {
    console.log(`\n[PHASE 3] Hydrating Details (Concurrency: ${CONCURRENCY})...`);

    // Add existing minter info first
    for (const smol of smolList) {
        const mintInfo = minterMap.get(smol.Id);
        if (mintInfo) {
            smol.Minted_By = mintInfo.minter;
            smol.Mint_Tx = mintInfo.tx;
            smol.Mint_Time = mintInfo.time;
        }
    }

    // Queue for metadata fetch
    let completed = 0;
    const total = smolList.length;

    // We update smolList in place
    // Helper to process a chunk
    const processItem = async (smol) => {
        try {
            const detail = await fetchWithRetry(`${API_BASE}/${smol.Id}`);
            // Merge metadata
            if (detail.kv_do) {
                smol.kv_do = detail.kv_do;
                // Normalize some fields for convenience
                const lyricData = detail.kv_do?.lyrics || {};
                smol.Lyrics = lyricData.lyrics || '';
                smol.Tags = lyricData.style || smol.Tags || []; // API list has Tags too
                smol.Prompt = detail.kv_do?.payload?.prompt || '';

                // STRIP IMAGES (Loaded from API now)
                if (smol.kv_do?.payload?.image) delete smol.kv_do.payload.image;
                if (smol.kv_do?.image_base64) delete smol.kv_do.image_base64;
                if (smol.Image) delete smol.Image;
            }
            // Merge Core Metadata (Address/Creator) from D1 if available
            if (detail.d1) {
                smol.Address = detail.d1.Address || smol.Address;
                smol.Creator = detail.d1.Creator || smol.Creator;
                // Capture Real Metrics for Radio Popularity
                smol.Plays = detail.d1.Plays || 0;
                smol.Views = detail.d1.Views || 0;
            }

            // REWRITE URLS TO API.SMOL.XYZ (Standardization)
            if (smol.song_url && smol.song_url.includes('cdn2.aisonggenerator.io')) {
                smol.song_url = smol.song_url.replace('cdn2.aisonggenerator.io', 'api.smol.xyz/song').replace('.mp3', '') + '.mp3';
            }
            if (smol.songs && Array.isArray(smol.songs)) {
                smol.songs.forEach(s => {
                    if (s.audio && s.audio.includes('cdn2.aisonggenerator.io')) {
                        s.audio = s.audio.replace('cdn2.aisonggenerator.io', 'api.smol.xyz/song').replace('.mp3', '') + '.mp3';
                    }
                });
            }
        } catch (e) {
            // FALLBACK: Use previous snapshot data if available for this specific failure
            const cached = previousState.get(smol.Id);
            if (cached) {
                smol.Tags = cached.Tags || smol.Tags;
                if (cached.song_url && cached.song_url.includes('cdn2.aisonggenerator.io')) {
                    smol.song_url = cached.song_url.replace('cdn2.aisonggenerator.io', 'api.smol.xyz/song').replace('.mp3', '') + '.mp3';
                }

                // Fix nested song lists too
                if (cached.songs && Array.isArray(cached.songs)) {
                    cached.songs.forEach(s => {
                        if (s.audio && s.audio.includes('cdn2.aisonggenerator.io')) {
                            s.audio = s.audio.replace('cdn2.aisonggenerator.io', 'api.smol.xyz/song').replace('.mp3', '') + '.mp3';
                        }
                    });
                    // Also update the song list in the smol object if it exists there
                    if (smol.songs) {
                        smol.songs = cached.songs;
                    }
                }
                smol.Address = cached.Address || smol.Address;
                smol.Creator = cached.Creator || smol.Creator;
                smol.Plays = cached.Plays || smol.Plays;
                smol.Views = cached.Views || smol.Views;
                smol.Minted_By = cached.Minted_By || smol.Minted_By;
            }
            smol._hydration_error = e.message;
        }
        completed++;
        if (completed % 50 === 0) process.stdout.write(`\rHydrated ${completed}/${total}...`);
    };

    // Parallel Execution
    for (let i = 0; i < total; i += CONCURRENCY) {
        const chunk = smolList.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(processItem));
    }

    console.log(`\nHydration Complete.`);
    return smolList;
}

async function main() {
    // 0. LOAD PREVIOUS STATE
    let previousState = { songs: new Map(), tagGraph: null };
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const oldData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            const oldSongs = Array.isArray(oldData) ? oldData : (oldData.songs || []);
            oldSongs.forEach(s => previousState.songs.set(s.Id, s));
            previousState.tagGraph = oldData.tagGraph || null;
            console.log(`[INIT] Loaded ${oldSongs.length} records from previous snapshot.`);
        } catch (e) { }
    }

    const minterMap = await scanBlockchain();
    const smolList = await scanApiList();
    const fullSnapshot = await hydrateDetails(smolList, minterMap, previousState.songs);

    // 4. DIFF REPORTING
    console.log(`\n[PHASE 4] Analysis & Saving...`);
    const newItems = fullSnapshot.filter(s => !previousState.songs.has(s.Id));

    if (newItems.length > 0) {
        console.log(`\n🚨 DETECTED ${newItems.length} NEW PUBLISHES/MINTS:`);
        newItems.forEach(s => {
            console.log(`   - [${s.Created_At}] ${s.Title} (ID: ${s.Id.slice(0, 8)}...)`);
            if (s.Minted_By) console.log(`     (Minted by ${s.Minted_By})`);
        });
    } else {
        console.log(`\n✅ No new items compared to last snapshot.`);
    }

    const outputData = {
        songs: fullSnapshot,
        tagGraph: previousState.tagGraph
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`\nSaved ${fullSnapshot.length} records to ${OUTPUT_FILE}`);
}

main().catch(console.error);
