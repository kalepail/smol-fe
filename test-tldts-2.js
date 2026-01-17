import { getDomain } from 'tldts';
import fs from 'fs';

const hosts = [
    "localhost",
    "smol.xyz",
    "dev.smol.xyz",
    "vcd15cbe7772f49c399c6a5babf22c1241717689176015.smol-fe.pages.dev",
    "smol-fe.pages.dev",
    "something.pages.dev"
];

const results = hosts.map(h => `${h} -> ${getDomain(h)}`).join('\n');
fs.writeFileSync('tldts-results.txt', results);
