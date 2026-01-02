
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SNAPSHOT_PATH = path.join(__dirname, '../src/data/smols-snapshot.json');
const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));

let updatedCount = 0;

data.forEach(s => {
    let tags = [];

    // 1. Try kv_do.lyrics.style
    if (s.kv_do && s.kv_do.lyrics && Array.isArray(s.kv_do.lyrics.style)) {
        tags = [...s.kv_do.lyrics.style];
    }

    // 2. Try parsing prompt if tags empty
    if (tags.length === 0 && s.kv_do && s.kv_do.payload && s.kv_do.payload.prompt) {
        const prompt = s.kv_do.payload.prompt;
        // Look for [STYLE: ...] block
        const match = prompt.match(/\[STYLE:\s*(.*?)\]/i);
        if (match) {
            const styleStr = match[1];
            // Split by semicolon or comma (some prompts might vary)
            // Usually "lofi; jazz; chill"
            tags = styleStr.split(/[;,]/).map(t => t.trim()).filter(Boolean);
        }
    }

    // 3. Update field
    if (tags.length > 0) {
        s.Tags = tags;
        updatedCount++;
    }
});

fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2));
console.log(`Updated ${updatedCount} items with Tags.`);
