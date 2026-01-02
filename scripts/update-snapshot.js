
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://api.smol.xyz';
const SNAPSHOT_PATH = path.join(__dirname, '../src/data/smols-snapshot.json');

async function main() {
    console.log('Starting snapshot update with pagination...');

    // 1. Read existing snapshot
    let existing = [];
    try {
        if (fs.existsSync(SNAPSHOT_PATH)) {
            existing = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
        }
    } catch (e) {
        console.warn('Could not read existing snapshot, starting fresh.');
    }
    const existingMap = new Map(existing.map(s => [s.Id, s]));

    // 2. Fetch all pages
    const allSmols = [];
    let nextCursor = null;
    let pageNum = 1;
    let hasMore = true;

    while (hasMore) {
        let url = API_URL;
        if (nextCursor) {
            url += `?cursor=${encodeURIComponent(nextCursor)}`;
        }

        console.log(`Fetching page ${pageNum}...`);
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch page ${pageNum}: ${res.status}`);
        }

        const data = await res.json();
        const pageSmols = data.smols || [];
        allSmols.push(...pageSmols);

        console.log(`  Got ${pageSmols.length} items. Total: ${allSmols.length}`);

        if (data.pagination && data.pagination.nextCursor) {
            nextCursor = data.pagination.nextCursor;
            hasMore = true;
            pageNum++;
        } else {
            hasMore = false;
        }
    }

    console.log(`Finished fetching list. Total items: ${allSmols.length}`);

    // 3. Hydrate details
    const newSnapshot = [];
    let hydratedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < allSmols.length; i++) {
        const s = allSmols[i];
        let merged = { ...s };

        // Use existing address/details if available
        if (!merged.Address && existingMap.has(s.Id)) {
            const ex = existingMap.get(s.Id);
            if (ex.Address) merged.Address = ex.Address;
            // potential merge of other fields if needed
        }

        // Check if we still need hydration
        // Adjust this condition based on what fields are critical. Address is the main one.
        if (!merged.Address) {
            process.stdout.write(`\r[${i + 1}/${allSmols.length}] Hydrating ${s.Id.substring(0, 8)}... `);
            try {
                const dRes = await fetch(`${API_URL}/${s.Id}`);
                if (dRes.ok) {
                    const detail = await dRes.json();

                    // Important: The API returns { kv_do: {...}, d1: { Id, Address, ... } }
                    // We must flatten 'd1' into the root object so the UI can find 'Address'.
                    if (detail.d1) {
                        merged = { ...merged, ...detail.d1 };
                    }

                    // Also keep other top-level keys like kv_do if needed
                    // (Excluding d1 itself to avoid duplication if we want, but keeping it is harmless)
                    merged = { ...merged, ...detail, ...merged }; // precedence: merged(d1) > detail > initial

                    // Explicitly ensure critical fields are at root if d1 didn't cover them (redundant safety)
                    if (!merged.Address && detail.kv_do?.payload?.address) {
                        merged.Address = detail.kv_do.payload.address;
                    }

                    hydratedCount++;
                } else {
                    // console.error(`\nFailed to hydrate ${s.Id}: ${dRes.status}`);
                }
            } catch (err) {
                // console.error(`\nError hydrating ${s.Id}:`, err.message);
            }
            // Small delay to be polite
            await new Promise(r => setTimeout(r, 20));
        } else {
            skippedCount++;
        }

        // Periodic update for skipped items too so user knows it's moving
        if (i % 100 === 0) {
            process.stdout.write(`\r[${i + 1}/${allSmols.length}] Processing...`);
        }

        newSnapshot.push(merged);
    }

    process.stdout.write('\n'); // clear line

    // 4. Write back
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(newSnapshot, null, 2));
    console.log(`\nSuccess! Wrote ${newSnapshot.length} items to ${SNAPSHOT_PATH}`);
    console.log(`Hydrated: ${hydratedCount}`);
    console.log(`Skipped (Cached): ${skippedCount}`);
}

main().catch(console.error);
