
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://api.smol.xyz';
const TARGET_PREFIX = 'CBNORBI';
const OUT_FILE = path.join(__dirname, '_api_count_meta.json');

async function main() {
    console.log(`[API Counter] Starting scan for prefix: ${TARGET_PREFIX}`);

    let nextCursor = null;
    let pageNum = 1;
    let hasMore = true;
    let totalScanned = 0;

    const stats = {
        total_items_scanned: 0,
        cbno_matched_items: 0,
        matched_addresses: {}, // Address -> count
        created_at_min: null,
        created_at_max: null,
        pages_fetched: 0,
        items_missing_address_in_list: 0,
        ended_with_hasMore_false: false
    };

    const cursorsSeen = new Set();

    while (hasMore) {
        let url = API_URL;
        if (nextCursor) {
            if (cursorsSeen.has(nextCursor)) {
                console.error('CRITICAL: Cursor loop detected!');
                break;
            }
            cursorsSeen.add(nextCursor);
            url += `?cursor=${encodeURIComponent(nextCursor)}`;
        }

        process.stdout.write(`\rFetching page ${pageNum}...`);
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`\nHTTP Error ${res.status} on page ${pageNum}`);
            break;
        }

        const data = await res.json();
        const smols = data.smols || [];
        stats.pages_fetched++;
        stats.total_items_scanned += smols.length;

        for (const s of smols) {
            if (!s.Address) {
                stats.items_missing_address_in_list++;
                continue;
            }

            if (s.Address.startsWith(TARGET_PREFIX)) {
                stats.cbno_matched_items++;
                stats.matched_addresses[s.Address] = (stats.matched_addresses[s.Address] || 0) + 1;

                if (s.Created_At) {
                    if (!stats.created_at_min || s.Created_At < stats.created_at_min) {
                        stats.created_at_min = s.Created_At;
                    }
                    if (!stats.created_at_max || s.Created_At > stats.created_at_max) {
                        stats.created_at_max = s.Created_At;
                    }
                }
            }
        }

        if (data.pagination && data.pagination.nextCursor) {
            nextCursor = data.pagination.nextCursor;
            hasMore = true;
            pageNum++;
        } else {
            hasMore = false;
            stats.ended_with_hasMore_false = true;
        }
    }

    console.log('\nScan Complete.');
    console.log(JSON.stringify(stats, null, 2));

    fs.writeFileSync(OUT_FILE, JSON.stringify(stats, null, 2));
    console.log(`Wrote stats to ${OUT_FILE}`);
}

main().catch(console.error);
