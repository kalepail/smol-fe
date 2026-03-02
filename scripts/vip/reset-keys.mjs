// Script to reset room keys in D1 (Local or Remote)
// Usage: node scripts/vip/reset-keys.mjs [prod]

// Note: Direct D1 access from node script requires 'wrangler d1 execute'.
// We'll spawn the wrangler command.

import { spawn } from 'child_process';

const isProd = process.argv.includes('prod');
const dbName = 'smol-chat-db'; // From wrangler.toml binding name or DB name? 
// Wrangler uses binding name in worker, but DB name in CLI.
// We named it "smol-chat-db" in wrangler.toml

const flag = isProd ? '--remote' : '--local';

console.log(`Resetting keys for ${dbName} (${isProd ? 'REMOTE' : 'LOCAL'})...`);

const sql = `DELETE FROM room_keys;`;

const cmd = `npx wrangler d1 execute ${dbName} ${flag} --command "${sql}"`;

console.log(`Running: ${cmd}`);

const child = spawn('npx', ['wrangler', 'd1', 'execute', dbName, flag, '--command', sql], {
    shell: true,
    stdio: 'inherit'
});

child.on('close', (code) => {
    if (code === 0) {
        console.log("✅ Room keys reset. New keys will be generated on next join.");
    } else {
        console.error("❌ Failed to reset keys.");
    }
});
