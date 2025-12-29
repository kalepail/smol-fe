import fs from 'fs';

const API_URL = 'https://api.smol.xyz';

async function main() {
    const res = await fetch(API_URL);
    const data = await res.json();
    const smols = data.smols || [];

    if (smols.length === 0) return;

    const s = smols[0];
    console.log('ID:', s.Id);
    console.log('Song_1:', s.Song_1);

    const candidates = [
        `${API_URL}/song/${s.Song_1}`,
        `${API_URL}/song/${s.Song_1}.mp3`,
        `${API_URL}/audio/${s.Song_1}`,
        `${API_URL}/audio/${s.Song_1}.mp3`,
        `${API_URL}/song/${s.Id}.mp3`
    ];

    for (const c of candidates) {
        try {
            const h = await fetch(c, { method: 'HEAD' });
            console.log(`Testing ${c} -> ${h.status}`);
            if (h.ok) {
                console.log('Content-Length:', h.headers.get('content-length'));
                return; // Found it
            }
        } catch (e) {
            console.log(`Testing ${c} -> Error: ${e.message}`);
        }
    }
}

main();
