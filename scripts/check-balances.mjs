import { execSync } from 'child_process';

const identities = [
    "dep_box_1765150025642",
    "dep_box_1765150399911",
    "deployer",
    "migrator",
    "temp_test",
    "tier-verifier-deployer",
    "vault_admin",
    "vault_deployer",
    "vault_deployer_v1"
];

const EXTRA_ADDRS = [
    { name: "Credentials File Key", address: "GBY2O4NMLHVT5KU6PDKUNXXGW2CQ4PUNZOTSHH6BWI6PM766RROTEUC4" }
];

async function checkBalance(name, address) {
    try {
        const res = await fetch(`https://horizon.stellar.org/accounts/${address}`);
        if (res.status === 404) {
            console.log(`${name.padEnd(25)} (${address.slice(0, 6)}..${address.slice(-6)}): ❌ Not Found on Mainnet`);
            return;
        }
        const data = await res.json();
        const native = data.balances.find(b => b.asset_type === 'native');
        if (native) {
            console.log(`${name.padEnd(25)} (${address.slice(0, 6)}..${address.slice(-6)}): 💰 ${native.balance} XLM`);
        } else {
            console.log(`${name.padEnd(25)} (${address.slice(0, 6)}..${address.slice(-6)}): ⚠️  No Native Balance`);
        }
    } catch (e) {
        console.log(`${name.padEnd(25)} (${address.slice(0, 6)}..${address.slice(-6)}): ❌ Error ${e.message}`);
    }
}

async function main() {
    console.log("🔍 Checking Balances on Mainnet...\n");

    for (const name of identities) {
        try {
            // Get address
            // Use --global or just assume standard if identity exists
            const output = execSync(`stellar keys address ${name}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            // The output might contain warnings on lines, take the last line that looks like a key
            const lines = output.split('\n');
            const address = lines.find(l => l.startsWith('G'))?.trim();

            if (address) {
                await checkBalance(name, address);
            } else {
                console.log(`${name.padEnd(25)}: ❌ Could not resolve address`);
            }
        } catch (e) {
            console.log(`${name.padEnd(25)}: ❌ Error getting address`);
        }
    }

    console.log("\n--- Extra Addresses ---\n");
    for (const item of EXTRA_ADDRS) {
        await checkBalance(item.name, item.address);
    }
}

main();
