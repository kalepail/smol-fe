import { getDomain } from 'tldts';

const hosts = [
    "localhost",
    "smol.xyz",
    "dev.smol.xyz",
    "vcd15cbe7772f49c399c6a5babf22c1241717689176015.pages.dev", // Cloudflare pages preview
    "smol-fe.pages.dev"
];

hosts.forEach(h => {
    console.log(`${h} -> ${getDomain(h)}`);
});
