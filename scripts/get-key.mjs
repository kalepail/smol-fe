
import { Mnemonic } from './../node_modules/@stellar/stellar-sdk/lib/minimal/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Manually read .env to get the mnemonic
const envPath = path.join(rootDir, '.env');
let mnemonicPhrase = "";

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.trim().startsWith('BATCH_DEPLOYER_MNEMONIC=')) {
            let val = line.split('=', 2)[1].trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            mnemonicPhrase = val;
            break;
        }
    }
}

if (!mnemonicPhrase) {
    console.error("No Mnemonic found in .env");
    process.exit(1);
}

try {
    const m = new Mnemonic(mnemonicPhrase);
    const keypair = m.getKeypair(0);
    console.log(`SECRET:${keypair.secret()}`);
} catch (e) {
    console.error("Error deriving key:", e.message);
    process.exit(1);
}
