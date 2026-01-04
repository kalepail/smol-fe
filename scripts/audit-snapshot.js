
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SNAPSHOT_PATH = path.join(__dirname, '../public/data/smols-snapshot.json');
const OUT_FILE = path.join(__dirname, '_snapshot_count_meta.json');
const TARGET_PREFIX = 'CBNORBI';

function audit() {
    if (!fs.existsSync(SNAPSHOT_PATH)) {
        console.error('Snapshot file not found at:', SNAPSHOT_PATH);
        return;
    }

    const stats = fs.statSync(SNAPSHOT_PATH);
    console.log(`Snapshot File: ${SNAPSHOT_PATH}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Modified: ${stats.mtime.toISOString()}`);

    const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    const totalSongs = data.length;
    console.log(`\nTotal Songs Loaded: ${totalSongs}`);

    const uniqueSongIds = new Set(data.map(s => s.Id)).size;
    console.log(`Unique Song IDs: ${uniqueSongIds}`);
    if (uniqueSongIds !== totalSongs) {
        console.warn('WARNING: Duplicate Song IDs detected!');
        // Find duplicates
        const idCounts = {};
        data.forEach(s => { idCounts[s.Id] = (idCounts[s.Id] || 0) + 1; });
        const dups = Object.entries(idCounts).filter(([k, v]) => v > 1).slice(0, 5);
        console.log('Sample Duplicates:', dups);
    }

    const artists = {};
    const prefixStats = {
        cbno_matched_items: 0,
        matched_addresses: {},
        created_at_min: null,
        created_at_max: null
    };

    let missingAddress = 0;
    let missingId = 0;
    let missingTitle = 0;
    let missingCreated = 0;

    data.forEach(s => {
        if (!s.Id) missingId++;
        if (!s.Title) missingTitle++;
        if (!s.Created_At) missingCreated++;

        if (!s.Address) {
            missingAddress++;
        } else {
            artists[s.Address] = (artists[s.Address] || 0) + 1;

            if (s.Address.startsWith(TARGET_PREFIX)) {
                prefixStats.cbno_matched_items++;
                prefixStats.matched_addresses[s.Address] = (prefixStats.matched_addresses[s.Address] || 0) + 1;

                if (s.Created_At) {
                    if (!prefixStats.created_at_min || s.Created_At < prefixStats.created_at_min) {
                        prefixStats.created_at_min = s.Created_At;
                    }
                    if (!prefixStats.created_at_max || s.Created_At > prefixStats.created_at_max) {
                        prefixStats.created_at_max = s.Created_At;
                    }
                }
            }
        }
    });

    const uniqueArtists = Object.keys(artists).length;
    console.log(`\nUnique Artists (by Address): ${uniqueArtists}`);
    console.log(`Missing Address: ${missingAddress}`);
    console.log(`Missing Id: ${missingId}`);
    console.log(`Missing Title: ${missingTitle}`);

    // Top Artists
    const sortedArtists = Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log('\nTop 10 Artists by Song Count:');
    sortedArtists.forEach(([addr, count]) => {
        console.log(`  ${addr}: ${count}`);
    });

    // Keys Check
    if (totalSongs > 0) {
        console.log('\nSample Item Keys:', Object.keys(data[0]));
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(prefixStats, null, 2));
    console.log(`\nPrefix stats written to ${OUT_FILE}`);
}

audit();
