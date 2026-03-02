
import fs from 'fs';
import path from 'path';

const BASE_DIR = 'C:\\Users\\Jeff\\Desktop\\1OF1 - Solstice';
const MASTERED_DIR = path.join(BASE_DIR, 'mastered');
const OUTPUT_FILE = path.join(BASE_DIR, 'upload_manifest.json');

// Artist/Album Info
const MANIFEST = {
    artist: '1OF1',
    album: 'Solstice',
    cover: '', // Will attempt to find
    tracks: []
};

function getFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => !f.startsWith('.'));
}

const rawFiles = getFiles(BASE_DIR);
const masteredFiles = getFiles(MASTERED_DIR);

// Find cover art
const coverCandidates = rawFiles.filter(f => f.match(/cover|art|front/i) && f.match(/\.(jpg|png|jpeg)$/i));
if (coverCandidates.length > 0) {
    MANIFEST.cover = path.join(BASE_DIR, coverCandidates[0]);
} else if (fs.existsSync(path.join(BASE_DIR, 'covers'))) {
    const coverDirDocs = getFiles(path.join(BASE_DIR, 'covers'));
    const best = coverDirDocs.find(f => f.match(/cover|art|front/i) && f.match(/\.(jpg|png|jpeg)$/i)) || coverDirDocs[0];
    if (best) MANIFEST.cover = path.join(BASE_DIR, 'covers', best);
}

// Find tracks
// Strategy: prefer mastered WAVs. If not, use MP3s from base.
// Parsing filename: "01 - Title.ext"
const tracks = [];

// Helper to parse filename
function parseTrack(filename, dir) {
    const match = filename.match(/^(\d+)\s*-\s*(.+)\.(mp3|wav|flac|m4a)(\.wav)?$/i);
    if (match) {
        return {
            num: parseInt(match[1]),
            title: match[2].trim(),
            path: path.join(dir, filename),
            ext: match[3] + (match[4] || '')
        };
    }
    return null;
}

// 1. Check Mastered
masteredFiles.forEach(f => {
    const t = parseTrack(f, MASTERED_DIR);
    if (t) tracks.push(t);
});

// 2. Check Base (only if track num not already present)
const existingNums = new Set(tracks.map(t => t.num));
rawFiles.forEach(f => {
    const t = parseTrack(f, BASE_DIR);
    if (t && !existingNums.has(t.num)) {
        tracks.push(t);
    }
});

// Sort by track number
tracks.sort((a, b) => a.num - b.num);

MANIFEST.tracks = tracks;

console.log(`Found ${tracks.length} tracks.`);
if (MANIFEST.cover) console.log(`Found cover: ${MANIFEST.cover}`);
else console.warn('No cover art found!');

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(MANIFEST, null, 2));
console.log(`Manifest written to ${OUTPUT_FILE}`);
