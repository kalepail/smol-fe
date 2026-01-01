
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SNAPSHOT_PATH = path.join(__dirname, '../src/data/smols-snapshot.json');
const API_URL = 'https://api.smol.xyz'; // Production API

async function fetchAllSmols() {
    let allSmols = [];
    let cursor = null;
    let hasMore = true;
    let page = 1;

    console.log('Fetching live smols from api.smol.xyz (ROOT)...');

    while (hasMore) {
        try {
            const url = new URL(`${API_URL}/`);
            url.searchParams.set('limit', '100');
            if (cursor) {
                url.searchParams.set('cursor', cursor);
            }

            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    // 'Accept': 'application/json' // Optional
                }
            });

            if (!res.ok) {
                const text = await res.text();
                console.error(`API Error ${res.status}:`, text.slice(0, 100));
                break; // Stop on error
            }

            const data = await res.json();
            const smols = data.smols || [];
            const pagination = data.pagination || {};

            allSmols = [...allSmols, ...smols];
            console.log(`Page ${page}: Fetched ${smols.length} smols. Total: ${allSmols.length}`);

            if (pagination.hasMore && pagination.nextCursor) {
                cursor = pagination.nextCursor;
                page++;
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error('Fetch failed:', e.message);
            break;
        }
    }

    return allSmols;
}

function mergeSnapshots(oldSnapshot, newSmols) {
    const oldMap = new Map(oldSnapshot.map(s => [s.Id, s]));
    const merged = [];

    // Process new smols (updates + new)
    for (const newSmol of newSmols) {
        const oldSmol = oldMap.get(newSmol.Id);

        if (oldSmol) {
            // Merge: Prefer new data, but keep old fields if missing in new
            merged.push({
                ...newSmol,
                Tags: (newSmol.Tags && newSmol.Tags.length > 0) ? newSmol.Tags : (oldSmol.Tags || []),
                Minted_By: oldSmol.Minted_By || null,
                Address: newSmol.Address || oldSmol.Address || null, // Preserve Address
            });
            oldMap.delete(newSmol.Id); // Mark as processed
        } else {
            // Brand new smol
            merged.push({
                ...newSmol,
                Tags: [],
                Minted_By: null,
                Address: newSmol.Address || null // API might miss this!
            });
        }
    }

    // Append remaining old smols (Safety net: keep them even if API didn't return them)
    // capable of handling data gaps or partial fetches
    if (oldMap.size > 0) {
        console.log(`Preserving ${oldMap.size} items from old snapshot that were not in API response.`);
        for (const oldSmol of oldMap.values()) {
            merged.push(oldSmol);
        }
    }

    return merged;
}

async function main() {
    try {
        // 1. Read old snapshot
        let oldSnapshot = [];
        try {
            const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
            oldSnapshot = JSON.parse(raw);
            console.log(`Loaded old snapshot: ${oldSnapshot.length} items`);
        } catch (e) {
            console.warn('Could not read old snapshot, starting fresh.');
        }

        // 2. Fetch new data
        const newSmols = await fetchAllSmols();
        if (newSmols.length === 0) {
            console.error('No smols fetched from API. Aborting snapshot update to avoid data loss.');
            return;
        }

        // 3. Merge
        const finalSnapshot = mergeSnapshots(oldSnapshot, newSmols);

        // 3b. Hydrate missing data via individual detail endpoints (Deep Hydration)
        // Fetches details for items missing Address OR Tags OR Mint info to ensure perfect snapshot quality.
        const incompleteItems = finalSnapshot.filter(s =>
            !s.Address ||
            !s.Tags ||
            (Array.isArray(s.Tags) && s.Tags.length === 0)
            // Note: We don't filter by missing Minted_By because many items just aren't minted.
        );

        if (incompleteItems.length > 0) {
            console.log(`\nFound ${incompleteItems.length} items with incomplete data (Address/Tags). Hydrating via detail endpoint...`);

            for (let i = 0; i < incompleteItems.length; i++) {
                const smol = incompleteItems[i];
                try {
                    // Simple rate limiting (100ms to be nice to API)
                    await new Promise(r => setTimeout(r, 20));
                    process.stdout.write(`\rHydrating ${i + 1}/${incompleteItems.length}: ${smol.Id.slice(0, 8)}`);

                    const detailRes = await fetch(`${API_URL}/${smol.Id}`);
                    if (detailRes.ok) {
                        const detailData = await detailRes.json();
                        // Support both wrapper structure {d1: {...}} and direct structure
                        const d1 = detailData.d1 || detailData.kv_do || detailData; // robust check

                        if (d1) {
                            // Merge Address
                            if (d1.Address) smol.Address = d1.Address;

                            // Merge Tags (Parse if string)
                            if (d1.Tags) {
                                if (typeof d1.Tags === 'string') {
                                    try { smol.Tags = JSON.parse(d1.Tags); } catch (e) { smol.Tags = []; }
                                } else {
                                    smol.Tags = d1.Tags;
                                }
                            }

                            // Merge Mint Info if present
                            if (d1.Minted_By) smol.Minted_By = d1.Minted_By;
                            if (d1.Mint_Token) smol.Mint_Token = d1.Mint_Token;
                            if (d1.Mint_Amm) smol.Mint_Amm = d1.Mint_Amm;
                        }
                    }
                } catch (e) {
                    console.error(`\nFailed to hydrate ${smol.Id}:`, e.message);
                }
            }
            console.log('\nHydration complete.');
        }

        // 4. Save
        // Sort by Created_At desc
        finalSnapshot.sort((a, b) => new Date(b.Created_At).getTime() - new Date(a.Created_At).getTime());

        fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(finalSnapshot, null, 2));
        console.log(`Successfully updated snapshot! New count: ${finalSnapshot.length}`);

    } catch (e) {
        console.error('Script failed:', e);
    }
}

main();
