
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'https://api.smol.xyz';
const SNAPSHOT_PATH = path.join(__dirname, '../public/data/smols-snapshot.json');

// Helper to base64 encode for cursor
function encodeCursor(params) {
    return btoa(JSON.stringify(params));
}

async function main() {
    console.log("Loading Snapshot...");
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    const snapshotIds = new Set(snapshot.map(s => s.Id));
    console.log(`Snapshot Size: ${snapshot.length} smols`);

    console.log("Scanning Live API (Deep Scan)...");

    let allLive = [];
    let cursor = null;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        let url = `${API_BASE}/?limit=100`;
        if (cursor) {
            url += `&cursor=${cursor}`;
        }

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const json = await res.json();

            const pageSmols = json.smols || [];
            if (pageSmols.length === 0) {
                hasMore = false;
                break;
            }

            allLive = allLive.concat(pageSmols);
            process.stdout.write(`\rFetched Page ${page} (Total: ${allLive.length})...`);

            if (json.pagination && json.pagination.nextCursor) {
                cursor = json.pagination.nextCursor;
            } else {
                const last = pageSmols[pageSmols.length - 1];
                cursor = encodeCursor({ created_at: last.Created_At, id: last.Id });
                if (pageSmols.length < 100) hasMore = false;
            }

            page++;
            if (allLive.length > 5000) {
                console.log("\nLimit reached (5000). Stopping.");
                break;
            }

        } catch (e) {
            console.log(`\nError fetching page ${page}:`, e.message);
            break;
        }
    }

    console.log(`\n\nTotal Live Smols: ${allLive.length}`);
    console.log("Comparing Snapshot vs Live...");

    const newPublishes = allLive.filter(s => !snapshotIds.has(s.Id));

    console.log(`Found ${newPublishes.length} newly published songs (missing from snapshot).`);

    let report = "--- RECENTLY PUBLISHED CANDIDATES ---\n";
    newPublishes.sort((a, b) => new Date(b.Created_At) - new Date(a.Created_At));

    newPublishes.forEach(s => {
        const line = `[${s.Created_At}] ${s.Title} (${s.Id})\nLINK: https://smol.xyz/${s.Id}\n`;
        report += line + "\n";
    });

    fs.writeFileSync('publish_report.txt', report);
    console.log(`Report saved to publish_report.txt (${newPublishes.length} candidates)`);
}

main().catch(console.error);
