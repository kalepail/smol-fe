import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@stellar/stellar-sdk';
const { Keypair, Contract, rpc, TransactionBuilder, Networks, xdr, Address, nativeToScVal } = pkg;

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Configuration
const NETWORK = "testnet";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const RPC_URL = "https://soroban-testnet.stellar.org";
const FRIEND_BOT_URL = "https://friendbot.stellar.org";
const IDENTITY_FILE = "deployer_secret_testnet.txt";

// Contract Paths
const CONTRACTS = {
    farmAttestations: {
        dir: "contracts/farm-attestations",
        wasm: "contracts/farm-attestations/target/wasm32v1-none/release/farm_attestations.wasm",
        wasmOpt: "contracts/farm-attestations/target/wasm32v1-none/release/farm_attestations.optimized.wasm"
    },
    tierVerifier: {
        dir: "contracts/tier-verifier",
        wasm: "contracts/tier-verifier/target/wasm32v1-none/release/tier_verifier.wasm",
        wasmOpt: "contracts/tier-verifier/target/wasm32v1-none/release/tier_verifier.optimized.wasm",
        vkey: "public/zk/verification_key.json"
    },
    risc0Verifier: {
        dir: "contracts/risc0-groth16-verifier",
        wasm: "contracts/risc0-groth16-verifier/target/wasm32v1-none/release/risc0_groth16_verifier.wasm",
        wasmOpt: "contracts/risc0-groth16-verifier/target/wasm32v1-none/release/risc0_groth16_verifier.optimized.wasm"
    }
};

// Helpers
function run(cmd, opts = {}) {
    console.log(`\n> ${cmd}`);
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

function runInherit(cmd, opts = {}) {
    console.log(`\n> ${cmd}`);
    try {
        const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
        console.log(out);
    } catch (e) {
        console.error("Command failed:");
        console.error(e.stdout);
        console.error(e.stderr);
        throw e;
    }
}

// Serialization Helpers (From deploy-tier-verifier.mjs)
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
    // snarkjs vkey format: [[X_c0, X_c1], [Y_c0, Y_c1], ["1","0"]]
    // CAP-0074 Bn254G2Affine::from_bytes expects: X_c1 || X_c0 || Y_c1 || Y_c0 (128 bytes)
    const x_c0 = BigInt(point[0][0]);
    const x_c1 = BigInt(point[0][1]);
    const y_c0 = BigInt(point[1][0]);
    const y_c1 = BigInt(point[1][1]);
    const result = new Uint8Array(128);
    result.set(bigintToBytes32(x_c1), 0);
    result.set(bigintToBytes32(x_c0), 32);
    result.set(bigintToBytes32(y_c1), 64);
    result.set(bigintToBytes32(y_c0), 96);
    return result;
}

async function getOrCreateInfo() {
    let secret;
    const secretPath = path.join(rootDir, IDENTITY_FILE);

    // 1. Try env var
    if (process.env.TESTNET_DEPLOYER_SECRET) {
        console.log("Using TESTNET_DEPLOYER_SECRET from env");
        secret = process.env.TESTNET_DEPLOYER_SECRET;
    } else if (existsSync(secretPath)) {
        console.log(`Using secret from ${IDENTITY_FILE}`);
        secret = readFileSync(secretPath, 'utf8').trim();
    } else {
        console.log("Generating new testnet identity...");
        const kp = Keypair.random();
        secret = kp.secret();
        writeFileSync(secretPath, secret);
        console.log(`Saved new secret to ${IDENTITY_FILE}`);
    }

    const kp = Keypair.fromSecret(secret);
    console.log(`Identity: ${kp.publicKey()}`);

    // Fund with friendbot
    console.log("Funding with Friendbot...");
    try {
        const res = await fetch(`${FRIEND_BOT_URL}?addr=${kp.publicKey()}`);
        const json = await res.json();
        console.log("Friendbot response:", json);
    } catch (e) {
        console.log("Friendbot funding failed (might already be funded):", e.message);
    }

    return kp;
}

// Main Deployment Logic
async function main() {
    console.log("🚀 Starting TESTNET Bundle Deployment...");
    const kp = await getOrCreateInfo();

    // Use secret key directly
    const SOURCE_ARG = kp.secret();

    const server = new rpc.Server(RPC_URL);

    const ids = {};

    // 1. Farm Attestations
    console.log("\n🌾 Deploying Farm Attestations...");
    try {
        runInherit(`cargo build --target wasm32v1-none --release`, { cwd: path.join(rootDir, CONTRACTS.farmAttestations.dir) });
        runInherit(`stellar contract optimize --wasm "${CONTRACTS.farmAttestations.wasm}" --wasm-out "${CONTRACTS.farmAttestations.wasmOpt}"`, { cwd: rootDir });
        const faHash = run(`stellar contract upload --wasm "${CONTRACTS.farmAttestations.wasmOpt}" --source ${SOURCE_ARG} --network ${NETWORK}`, { cwd: rootDir }).match(/[a-f0-9]{64}/)[0];
        const faId = run(`stellar contract deploy --wasm-hash ${faHash} --source ${SOURCE_ARG} --network ${NETWORK}`, { cwd: rootDir }).trim();
        console.log(`> ID: ${faId}`);
        ids.farm = faId;

        // Initialize Farm Attestations
        console.log("> Initializing Farm Attestations (init_admin)...");
        runInherit(`stellar contract invoke --id ${faId} --source ${SOURCE_ARG} --network ${NETWORK} -- init_admin --admin ${kp.publicKey()}`, { cwd: rootDir });
    } catch (e) {
        console.error("Error deploying Farm Attestations:", e);
        throw e;
    }


    // 2. RISC0 Verifier
    console.log("\n🤖 Deploying RISC0 Verifier...");
    try {
        runInherit(`cargo build --target wasm32v1-none --release`, { cwd: path.join(rootDir, CONTRACTS.risc0Verifier.dir) });
        runInherit(`stellar contract optimize --wasm "${CONTRACTS.risc0Verifier.wasm}" --wasm-out "${CONTRACTS.risc0Verifier.wasmOpt}"`, { cwd: rootDir });
        const r0Hash = run(`stellar contract upload --wasm "${CONTRACTS.risc0Verifier.wasmOpt}" --source ${SOURCE_ARG} --network ${NETWORK}`, { cwd: rootDir }).match(/[a-f0-9]{64}/)[0];
        const r0Id = run(`stellar contract deploy --wasm-hash ${r0Hash} --source ${SOURCE_ARG} --network ${NETWORK}`, { cwd: rootDir }).trim();
        console.log(`> ID: ${r0Id}`);
        ids.risc0 = r0Id;

        // Initialize RISC0 Verifier
        console.log("> Initializing RISC0 Verifier (init_admin)...");
        runInherit(`stellar contract invoke --id ${r0Id} --source ${SOURCE_ARG} --network ${NETWORK} -- init_admin --admin ${kp.publicKey()}`, { cwd: rootDir });
    } catch (e) {
        console.error("Error deploying RISC0 Verifier:", e);
        throw e;
    }


    // 3. Tier Verifier
    console.log("\n🛡️ Deploying Tier Verifier...");
    try {
        runInherit(`cargo build --target wasm32v1-none --release`, { cwd: path.join(rootDir, CONTRACTS.tierVerifier.dir) });
        runInherit(`stellar contract optimize --wasm "${CONTRACTS.tierVerifier.wasm}" --wasm-out "${CONTRACTS.tierVerifier.wasmOpt}"`, { cwd: rootDir });
        const tvHash = run(`stellar contract upload --wasm "${CONTRACTS.tierVerifier.wasmOpt}" --source ${SOURCE_ARG} --network ${NETWORK}`, { cwd: rootDir }).match(/[a-f0-9]{64}/)[0];
        const tvId = run(`stellar contract deploy --wasm-hash ${tvHash} --source ${SOURCE_ARG} --network ${NETWORK}`, { cwd: rootDir }).trim();
        console.log(`> ID: ${tvId}`);
        ids.tier = tvId;

        // Initialize Tier Verifier (Complex!)
        console.log("> Initializing Tier Verifier with VKEY...");

        const vkeyRaw = JSON.parse(readFileSync(path.join(rootDir, CONTRACTS.tierVerifier.vkey), 'utf8'));
        const alpha_g1_bytes = serializeG1(vkeyRaw.vk_alpha_1);
        const beta_g2_bytes = serializeG2(vkeyRaw.vk_beta_2);
        const gamma_g2_bytes = serializeG2(vkeyRaw.vk_gamma_2);
        const delta_g2_bytes = serializeG2(vkeyRaw.vk_delta_2);
        const ic_bytes_array = vkeyRaw.IC.map(point => serializeG1(point));

        const vkeyScVal = xdr.ScVal.scvMap([
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("alpha_g1"), val: xdr.ScVal.scvBytes(alpha_g1_bytes) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("beta_g2"), val: xdr.ScVal.scvBytes(beta_g2_bytes) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("delta_g2"), val: xdr.ScVal.scvBytes(delta_g2_bytes) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("gamma_g2"), val: xdr.ScVal.scvBytes(gamma_g2_bytes) }),
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol("ic"),
                val: xdr.ScVal.scvVec(ic_bytes_array.map(b => xdr.ScVal.scvBytes(b)))
            })
        ]);

        const contract = new Contract(tvId);
        const op = contract.call("initialize",
            new Address(kp.publicKey()).toScVal(),
            vkeyScVal
        );

        const account = await server.getAccount(kp.publicKey());



        // Build the transaction once
        const initTx = new TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: NETWORK_PASSPHRASE
        })
            .addOperation(op)
            .setTimeout(30)
            .build();

        initTx.sign(kp);

        console.log("  Simulating Tier init...");
        const sim = await server.simulateTransaction(initTx);
        if (rpc.Api.isSimulationError(sim)) {
            console.error("Simulation Error Details:", JSON.stringify(sim, null, 2));
            throw new Error(`Simulation failed`);
        }

        console.log("  Submitting Tier init...");
        const prepInit = await server.prepareTransaction(initTx);
        prepInit.sign(kp);
        const resInit = await server.sendTransaction(prepInit);
        if (resInit.status !== "PENDING") throw new Error(JSON.stringify(resInit));

        // Wait for success
        let statusInit;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            statusInit = await server.getTransaction(resInit.hash);
            if (statusInit.status === "SUCCESS") break;
        }
        if (statusInit.status !== "SUCCESS") throw new Error(`Tier init tx failed`);
        console.log("  Tier Verifier Initialized.");

    } catch (e) {
        console.error("Error deploying Tier Verifier:", e);
        throw e;
    }


    // SUMMARY
    console.log("\n\n✅ DEPLOYMENT COMPLETE");
    console.log("----------------------------------------");
    console.log(`PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_TESTNET="${ids.farm}"`);
    console.log(`PUBLIC_TIER_VERIFIER_CONTRACT_ID_TESTNET="${ids.tier}"`);
    console.log(`PUBLIC_RISC0_GROTH16_VERIFIER_CONTRACT_ID_TESTNET="${ids.risc0}"`);
    console.log("----------------------------------------");

    // Write to a local .env.testnet for easy copying
    writeFileSync(path.join(rootDir, '.env.testnet.generated'),
        `PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_TESTNET="${ids.farm}"
PUBLIC_TIER_VERIFIER_CONTRACT_ID_TESTNET="${ids.tier}"
PUBLIC_RISC0_GROTH16_VERIFIER_CONTRACT_ID_TESTNET="${ids.risc0}"
`);
    console.log("Values saved to .env.testnet.generated");
}

main().catch(err => {
    console.error("FAILED:", err);
    process.exit(1);
});
