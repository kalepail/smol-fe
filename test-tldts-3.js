import { getDomain } from 'tldts';
import fs from 'fs';

const hosts = [
    "noot.smol.xyz",
    "smol.xyz",
    "www.smol.xyz"
];

const results = hosts.map(h => `${h} -> ${getDomain(h)}`).join('\n');
fs.writeFileSync('tldts-results-prod.txt', results);
