import { readFileSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@stellar/stellar-sdk';
const { Keypair, Contract, rpc, TransactionBuilder, Networks, xdr, Address, nativeToScVal } = pkg;

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Constants
const WASM_SOURCE = "contracts/tier-verifier/target/wasm32v1-none/release/tier_verifier.wasm";
const WASM_OPTIMIZED = "contracts/tier-verifier/target/wasm32v1-none/release/tier_verifier.optimized.wasm";
const VKEY_PATH = "public/zk/verification_key.json";
const SECRET_PATH = "deployer_secret.txt";
const RPC_URL = "https://mainnet.sorobanrpc.com";
const DEPLOYER_IDENTITY = "tier-verifier-deployer";

// ============================================================================
// Serialization Helpers
// ============================================================================

function bigintToBytes32(value) {
    const bytes = new Uint8Array(32);
    let v = BigInt(value);
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return bytes;
}

function serializeG1(point) {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);
    const result = new Uint8Array(64);
    result.set(bigintToBytes32(x), 0);
    result.set(bigintToBytes32(y), 32);
    return result;
}

function serializeG2(point) {
    const x_c1 = BigInt(point[0][0]);
    const x_c0 = BigInt(point[0][1]);
    const y_c1 = BigInt(point[1][0]);
    const y_c0 = BigInt(point[1][1]);
    const result = new Uint8Array(128);
    result.set(bigintToBytes32(x_c1), 0);
    result.set(bigintToBytes32(x_c0), 32);
    result.set(bigintToBytes32(y_c1), 64);
    result.set(bigintToBytes32(y_c0), 96);
    return result;
}

// ============================================================================
// Main Deployment Script
// ============================================================================

async function main() {
    console.log("🔍 Starting HYBRID deployment process (FORCE REBUILD + SYMBOL KEYS)...");

    // 1. Check Identity & Load Secret for SDK
    console.log(`\n🔑 Checking identity...`);
    let secret;
    try {
        if (existsSync(path.join(rootDir, SECRET_PATH))) {
            secret = readFileSync(path.join(rootDir, SECRET_PATH), 'utf8').trim();
        } else {
            secret = execSync(`stellar keys show ${DEPLOYER_IDENTITY}`, { encoding: 'utf8' }).trim().split('\n').pop().trim();
        }
    } catch (e) { }

    if (!secret || secret.length < 50) {
        try {
            secret = readFileSync(path.join(rootDir, SECRET_PATH), 'utf8').trim();
        } catch (e) {
            console.error("❌ Please ensure deployer_secret.txt contains the secret key.");
            process.exit(1);
        }
    }
    const kp = Keypair.fromSecret(secret);
    console.log(`✅ Identity: ${kp.publicKey()}`);

    // 2. Build & Optimize WASM (CLI)
    console.log("\n🔨 Building & Optimizing WASM...");

    try {
        console.log("   Building (cargo)...");
        execSync("cargo build --target wasm32v1-none --release", {
            stdio: 'inherit',
            cwd: path.join(rootDir, 'contracts/tier-verifier')
        });
    } catch (e) {
        console.error("❌ Build failed:", e.message);
        process.exit(1);
    }

    try {
        console.log("   Optimizing (stellar)...");
        execSync(`stellar contract optimize --wasm "${WASM_SOURCE}" --wasm-out "${WASM_OPTIMIZED}"`, {
            stdio: 'pipe',
            cwd: rootDir
        });
        console.log("✅ WASM optimized.");
    } catch (e) {
        console.error("❌ Optimization failed:", e.message);
        process.exit(1);
    }

    // 3. Install WASM (CLI)
    console.log(`\n📤 Installing WASM (${WASM_OPTIMIZED})...`);
    let newWasmHash;
    try {
        const installCmd = `stellar contract install --wasm "${WASM_OPTIMIZED}" --source ${DEPLOYER_IDENTITY} --network mainnet --rpc-url ${RPC_URL} --network-passphrase "Public Global Stellar Network ; September 2015"`;
        const output = execSync(installCmd, { encoding: 'utf8', cwd: rootDir });
        const match = output.match(/([a-f0-9]{64})/);
        if (match) newWasmHash = match[1];
        else newWasmHash = output.trim().split('\n').pop().trim();
        console.log(`✅ WASM Hash: ${newWasmHash}`);
    } catch (e) {
        if (e.message.includes("already installed") || e.stderr?.toString().includes("already installed")) {
            console.log("⚠️  WASM already installed. Computing hash locally...");
            const crypto = await import('crypto');
            const fileBuffer = readFileSync(path.join(rootDir, WASM_OPTIMIZED));
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            newWasmHash = hashSum.digest('hex');
            console.log(`✅ Computed hash: ${newWasmHash}`);
        } else {
            console.error("❌ Install failed:", e.message);
            process.exit(1);
        }
    }

    if (!newWasmHash) process.exit(1);

    // 4. Deploy New Instance (CLI)
    console.log(`\n🚀 Deploying NEW contract instance...`);
    let newContractId;
    try {
        const deployCmd = `stellar contract deploy --wasm-hash ${newWasmHash} --source ${DEPLOYER_IDENTITY} --network mainnet --rpc-url ${RPC_URL} --network-passphrase "Public Global Stellar Network ; September 2015"`;
        const output = execSync(deployCmd, { encoding: 'utf8', cwd: rootDir });
        newContractId = output.trim().split('\n').pop().trim();
        console.log(`✅ New Contract ID: ${newContractId}`);

        const fs = await import('fs');
        fs.writeFileSync(path.join(rootDir, 'deployed-contract-id.txt'), newContractId);
    } catch (e) {
        console.error("❌ Deploy failed:", e.message);
        process.exit(1);
    }

    // 5. Initialize Contract (SDK)
    console.log("\n🔐 Initializing Contract via SDK (Manual ScMap construction)...");
    try {
        const vkeyRaw = JSON.parse(readFileSync(path.join(rootDir, VKEY_PATH), 'utf8'));

        const alpha_g1_bytes = serializeG1(vkeyRaw.vk_alpha_1);
        const beta_g2_bytes = serializeG2(vkeyRaw.vk_beta_2);
        const gamma_g2_bytes = serializeG2(vkeyRaw.vk_gamma_2);
        const delta_g2_bytes = serializeG2(vkeyRaw.vk_delta_2);
        const ic_bytes_array = vkeyRaw.IC.map(point => serializeG1(point));

        // Use xdr.ScVal directly to force SYMBOL keys
        const vkeyScVal = xdr.ScVal.scvMap([
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("alpha_g1"), val: xdr.ScVal.scvBytes(alpha_g1_bytes) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("beta_g2"), val: xdr.ScVal.scvBytes(beta_g2_bytes) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("delta_g2"), val: xdr.ScVal.scvBytes(delta_g2_bytes) }), // D < G
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("gamma_g2"), val: xdr.ScVal.scvBytes(gamma_g2_bytes) }),
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol("ic"),
                val: xdr.ScVal.scvVec(ic_bytes_array.map(b => xdr.ScVal.scvBytes(b)))
            })
        ]);

        const server = new rpc.Server(RPC_URL);
        const account = await server.getAccount(kp.publicKey());
        const contract = new Contract(newContractId);

        const op = contract.call("initialize",
            new Address(kp.publicKey()).toScVal(), // admin
            vkeyScVal // vkey
        );

        const tx = new TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: Networks.PUBLIC
        })
            .addOperation(op)
            .setTimeout(30)
            .build();

        tx.sign(kp);

        console.log("Simulating initialization...");
        const sim = await server.simulateTransaction(tx);

        if (rpc.Api.isSimulationError(sim)) {
            console.error("❌ Simulation Failed:", JSON.stringify(sim, null, 2));
            process.exit(1);
        }

        console.log("Submitting initialization...");
        const preparedTx = await server.prepareTransaction(tx);
        preparedTx.sign(kp);
        const result = await server.sendTransaction(preparedTx);

        if (result.status !== "PENDING") {
            console.error("❌ Submission Failed:", result);
            process.exit(1);
        }

        console.log(`✅ Initialization TX: ${result.hash}`);

        let status = await server.getTransaction(result.hash);
        let retries = 0;
        while (status.status === "NOT_FOUND" && retries < 20) {
            await new Promise(r => setTimeout(r, 2000));
            status = await server.getTransaction(result.hash);
            retries++;
        }

        if (status.status === "SUCCESS") {
            console.log("✅ Contract Initialized & Ready!");
            console.log(`\n🎉 FINAL CONTRACT ID: ${newContractId}`);
            console.log("👉 Please update zkTypes.ts with this ID.");
        } else {
            console.warn("⚠️  Transaction status:", status.status);
        }

    } catch (e) {
        console.error("❌ Initialization failed:", e);
        process.exit(1);
    }
}

main();
