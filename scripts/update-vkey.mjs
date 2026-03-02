/**
 * update-vkey.mjs — Fix the G2 limb ordering in the on-chain tier verifier vkey.
 *
 * The original deploy serialized G2 points with c0/c1 limbs SWAPPED relative to
 * what CAP-0074 Bn254G2Affine::from_bytes expects.  This script calls update_vkey()
 * on the already-deployed contract to overwrite the stored vkey with the correct
 * byte layout (X_c1 || X_c0 || Y_c1 || Y_c0).
 *
 * snarkjs vkey.json G2 format: [[X_c0, X_c1], [Y_c0, Y_c1], ["1","0"]]
 * CAP-0074 expects:             X_c1 || X_c0 || Y_c1 || Y_c0  (128 bytes BE)
 *
 * Usage:
 *   node scripts/update-vkey.mjs
 *
 * Reads:
 *   - deployer_secret_testnet.txt  (admin keypair)
 *   - public/zk/verification_key.json  (circom vkey)
 *   - .env  (PUBLIC_TIER_VERIFIER_CONTRACT_ID_TESTNET)
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@stellar/stellar-sdk';
const { Keypair, Contract, rpc, TransactionBuilder, Networks, xdr, Address } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const NETWORK_PASSPHRASE = Networks.TESTNET;
const RPC_URL = 'https://soroban-testnet.stellar.org';

// ── Read config ──────────────────────────────────────────────────────────────

function readEnv(filePath) {
    if (!existsSync(filePath)) return {};
    const out = {};
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\n]*)"?\s*$/);
        if (m) out[m[1]] = m[2].trim();
    }
    return out;
}

const env = readEnv(path.join(rootDir, '.env'));

const TIER_VERIFIER_CONTRACT_ID =
    process.env.TIER_VERIFIER_CONTRACT_ID ||
    env.PUBLIC_TIER_VERIFIER_CONTRACT_ID_TESTNET;

if (!TIER_VERIFIER_CONTRACT_ID) {
    console.error('ERROR: PUBLIC_TIER_VERIFIER_CONTRACT_ID_TESTNET not set in .env');
    process.exit(1);
}

const secretPath = path.join(rootDir, 'deployer_secret_testnet.txt');
if (!existsSync(secretPath)) {
    console.error(`ERROR: ${secretPath} not found`);
    process.exit(1);
}
const secret = readFileSync(secretPath, 'utf8').trim();
const kp = Keypair.fromSecret(secret);

const vkeyPath = path.join(rootDir, 'public/zk/verification_key.json');
if (!existsSync(vkeyPath)) {
    console.error(`ERROR: ${vkeyPath} not found`);
    process.exit(1);
}
const vkeyRaw = JSON.parse(readFileSync(vkeyPath, 'utf8'));

console.log(`Admin public key : ${kp.publicKey()}`);
console.log(`Tier Verifier ID : ${TIER_VERIFIER_CONTRACT_ID}`);
console.log(`vkey path        : ${vkeyPath}`);

// ── Serialization (correct CAP-0074 ordering) ────────────────────────────────

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
    // CAP-0074 Bn254G2Affine::from_bytes expects: X_c1 || X_c0 || Y_c1 || Y_c0
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

// ── Build corrected vkey ScVal ───────────────────────────────────────────────

const alpha_g1_bytes = serializeG1(vkeyRaw.vk_alpha_1);
const beta_g2_bytes  = serializeG2(vkeyRaw.vk_beta_2);
const gamma_g2_bytes = serializeG2(vkeyRaw.vk_gamma_2);
const delta_g2_bytes = serializeG2(vkeyRaw.vk_delta_2);
const ic_bytes_array = vkeyRaw.IC.map(p => serializeG1(p));

console.log(`\nSerialized sizes: alpha=${alpha_g1_bytes.length}, beta=${beta_g2_bytes.length}, IC count=${ic_bytes_array.length}`);

const vkeyScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('alpha_g1'), val: xdr.ScVal.scvBytes(alpha_g1_bytes) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('beta_g2'),  val: xdr.ScVal.scvBytes(beta_g2_bytes) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('delta_g2'), val: xdr.ScVal.scvBytes(delta_g2_bytes) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('gamma_g2'), val: xdr.ScVal.scvBytes(gamma_g2_bytes) }),
    new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('ic'),
        val: xdr.ScVal.scvVec(ic_bytes_array.map(b => xdr.ScVal.scvBytes(b))),
    }),
]);

// ── Submit update_vkey transaction ───────────────────────────────────────────

const server = new rpc.Server(RPC_URL);

async function main() {
    console.log('\nFetching account...');
    const account = await server.getAccount(kp.publicKey());

    const contract = new Contract(TIER_VERIFIER_CONTRACT_ID);
    // update_vkey(env, vkey) — admin is pulled from contract storage, require_auth enforced internally
    const op = contract.call(
        'update_vkey',
        vkeyScVal,
    );

    const tx = new TransactionBuilder(account, {
        fee: '100000',
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(op)
        .setTimeout(30)
        .build();

    console.log('Simulating update_vkey...');
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
        console.error('Simulation FAILED:');
        console.error(JSON.stringify(sim, null, 2));
        process.exit(1);
    }
    console.log('Simulation OK.');

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(kp);

    console.log('Submitting update_vkey...');
    const res = await server.sendTransaction(prepared);
    if (res.status !== 'PENDING') {
        console.error('Send failed:', JSON.stringify(res, null, 2));
        process.exit(1);
    }

    console.log(`Tx submitted: ${res.hash}`);
    console.log('Waiting for confirmation...');

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const status = await server.getTransaction(res.hash);
        if (status.status === 'SUCCESS') {
            console.log(`\n✅ update_vkey confirmed: ${res.hash}`);
            console.log('G2 limb ordering fixed. Room 1 on-chain proof submission should now work.');
            return;
        }
        if (status.status === 'FAILED') {
            console.error('Tx FAILED:', JSON.stringify(status, null, 2));
            process.exit(1);
        }
        process.stdout.write('.');
    }

    console.warn('\nWarning: tx not confirmed after 30s. Check the hash manually.');
    console.log(`Hash: ${res.hash}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
