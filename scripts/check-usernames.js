import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const snapshotPath = path.join(__dirname, '../public/data/GalacticSnapshot.json');

try {
    const rawData = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(rawData);

    // Support both array and object format
    const songs = Array.isArray(snapshot) ? snapshot : (snapshot.songs || []);

    console.log(`Total songs in snapshot: ${songs.length}`);

    const usernames = new Set();
    const songsWithUsername = [];

    songs.forEach(song => {
        if (song.Username) {
            usernames.add(song.Username);
            songsWithUsername.push({
                title: song.Title,
                username: song.Username,
                id: song.Id
            });
        }
    });

    console.log(`Total songs with 'Username' field: ${songsWithUsername.length}`);
    console.log(`Unique Usernames found: ${usernames.size}`);

    if (usernames.size > 0) {
        console.log('\n--- Usernames List ---');
        console.log(Array.from(usernames).sort().join('\n'));
    } else {
        console.log('\nNo usernames found. Checking for "Creator" field...');
        const creators = new Set();
        songs.forEach(s => {
            if (s.Creator) creators.add(s.Creator);
        });
        console.log(`Unique 'Creator' values found: ${creators.size}`);
        console.log('(First 10 Creators):');
        console.log(Array.from(creators).slice(0, 10).join('\n'));
    }

} catch (e) {
    console.error("Error reading snapshot:", e.message);
}
