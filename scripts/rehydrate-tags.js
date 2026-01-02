/**
 * Force rehydrate all items in snapshot to get Tags
 * Run with: node scripts/rehydrate-tags.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://api.smol.xyz';
const SNAPSHOT_PATH = path.join(__dirname, '../src/data/smols-snapshot.json');

async function main() {
    console.log('Loading snapshot...');
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    console.log(`Found ${snapshot.length} items in snapshot`);

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < snapshot.length; i++) {
        const item = snapshot[i];

        // Skip if already has Tags
        if (item.Tags && Array.isArray(item.Tags) && item.Tags.length > 0) {
            continue;
        }

        process.stdout.write(`\r[${i + 1}/${snapshot.length}] Hydrating ${item.Id?.substring(0, 8)}... `);

        try {
            const res = await fetch(`${API_URL}/${item.Id}`);
            if (res.ok) {
                const detail = await res.json();

                // Extract tags from kv_do.lyrics.style
                if (detail.kv_do?.lyrics?.style && Array.isArray(detail.kv_do.lyrics.style)) {
                    item.Tags = detail.kv_do.lyrics.style;
                    updated++;
                } else if (detail.kv_do?.payload?.prompt) {
                    // Fallback: extract from prompt
                    const match = detail.kv_do.payload.prompt.match(/\[STYLE:\s*(.*?)\]/i);
                    if (match) {
                        item.Tags = match[1].split(/[;,]/).map(t => t.trim()).filter(Boolean);
                        updated++;
                    }
                }

                // Also preserve kv_do for future use
                if (detail.kv_do && !item.kv_do) {
                    item.kv_do = detail.kv_do;
                }
                if (detail.d1 && !item.d1) {
                    item.d1 = detail.d1;
                }
            }
        } catch (e) {
            failed++;
        }

        // Small delay to be polite
        await new Promise(r => setTimeout(r, 30));
    }

    console.log(`\n\nUpdated ${updated} items with Tags`);
    console.log(`Failed: ${failed}`);

    // Write back
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`Saved to ${SNAPSHOT_PATH}`);
}

main().catch(console.error);
