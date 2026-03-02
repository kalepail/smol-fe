import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@stellar/stellar-sdk';
const { Keypair, Contract, rpc, TransactionBuilder, Networks, xdr, Address, Operation, TimeoutInfinite } = pkg;

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Constants
const WASM_PATH = "contracts/tier-verifier/target/wasm32v1-none/release/tier_verifier.wasm";
const VKEY_PATH = "public/zk/verification_key.json";
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

// Friendbot to fund account
async function fundWithFriendbot(addr) {
    try {
        const response = await fetch(`https://friendbot.stellar.org/?addr=${addr}`);
        const json = await response.json();
        console.log("Friendbot:", json);
    } catch (e) {
        console.error("Friendbot failed:", e);
    }
}

// Helpers
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
    // SnarkJS output: [ [c0 (real), c1 (imag)], ... ]
    // EIP-197 / BN254 expectation: Fp2 encoded as c1 then c0 (Big Endian of coefficients?)
    // Actually, usually it is: c1 * u + c0.
    // Ethereum precompile expects: c1 then c0.

    // So we map:
    const c0_x = BigInt(point[0][0]); // Real
    const c1_x = BigInt(point[0][1]); // Imag
    const c0_y = BigInt(point[1][0]); // Real
    const c1_y = BigInt(point[1][1]); // Imag

    const result = new Uint8Array(128);
    // Write c1 then c0
    result.set(bigintToBytes32(c1_x), 0);
    result.set(bigintToBytes32(c0_x), 32);
    result.set(bigintToBytes32(c1_y), 64);
    result.set(bigintToBytes32(c0_y), 96);
    return result;
}

async function main() {
    console.log("🚀 Redeploying Tier Verifier (TESTNET) with FIXED G2 Encoding...");

    // 1. Generate Deployer
    const deployer = Keypair.random();
    console.log("Deployer:", deployer.publicKey());
    await fundWithFriendbot(deployer.publicKey());

    const server = new rpc.Server(RPC_URL);
    let account = await loadAccount(server, deployer.publicKey());

    // 2. Upload WASM
    console.log("Reading WASM...", WASM_PATH);
    const wasmBuf = readFileSync(path.resolve(rootDir, WASM_PATH));

    const uploadTx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: NETWORK_PASSPHRASE
    })
        .addOperation(Operation.uploadContractWasm({ wasm: wasmBuf }))
        .setTimeout(30)
        .build();

    uploadTx.sign(deployer);
    console.log("Uploading WASM...");
    const uploadPrep = await server.prepareTransaction(uploadTx);
    uploadPrep.sign(deployer);
    const uploadRes = await server.sendTransaction(uploadPrep);

    let wasmHash = await waitForTransaction(server, uploadRes.hash);
    // Extract wasm hash from return value? 
    // Actually, for uploadContractWasm, the return value is the hash.
    // Check result meta.
    console.log("WASM Uploaded. Extracting hash...");
    // Just fetch tx details/meta to identify. 
    // Or we can pre-calculate hash:
    const crypto = await import('crypto');
    const hashSum = crypto.createHash('sha256');
    hashSum.update(wasmBuf);
    const calculatedHash = hashSum.digest('hex');
    console.log("Calculated WASM Hash:", calculatedHash);
    wasmHash = calculatedHash;

    // 3. Instantiate Contract
    console.log("Instantiating Contract...");
    account = await loadAccount(server, deployer.publicKey()); // refresh sequence
    const deployOp = Operation.createCustomContract({
        address: new Address(deployer.publicKey()),
        wasmHash: Buffer.from(wasmHash, 'hex'),
        salt: crypto.randomBytes(32)
    });

    const deployTx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: NETWORK_PASSPHRASE
    })
        .addOperation(deployOp)
        .setTimeout(30)
        .build();

    deployTx.sign(deployer);

    // Simulate to get Contract ID
    console.log("Simulating deployment to get ID...");
    const deploySim = await server.simulateTransaction(deployTx);
    if (rpc.Api.isSimulationError(deploySim)) {
        console.error("Deploy Simulation Failed:", deploySim);
        process.exit(1);
    }

    const deployResultVal = deploySim.result.retval;
    const newContractId = Address.fromScVal(deployResultVal).toString();
    console.log("\n✅ PRE-CALCULATED CONTRACT ID:", newContractId);

    const deployPrep = await server.prepareTransaction(deployTx);
    deployPrep.sign(deployer);
    const deployRes = await server.sendTransaction(deployPrep);

    await waitForTransaction(server, deployRes.hash); // Don't return val, just wait
    console.log("Contract deployed.");

    // 4. Initialize
    console.log("Initializing...");
    account = await loadAccount(server, deployer.publicKey());
    const contract = new Contract(newContractId);

    const vkeyRaw = JSON.parse(readFileSync(path.resolve(rootDir, VKEY_PATH), 'utf8'));
    const vkeyScVal = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("alpha_g1"), val: xdr.ScVal.scvBytes(serializeG1(vkeyRaw.vk_alpha_1)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("beta_g2"), val: xdr.ScVal.scvBytes(serializeG2(vkeyRaw.vk_beta_2)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("delta_g2"), val: xdr.ScVal.scvBytes(serializeG2(vkeyRaw.vk_delta_2)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("gamma_g2"), val: xdr.ScVal.scvBytes(serializeG2(vkeyRaw.vk_gamma_2)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic"), val: xdr.ScVal.scvVec(vkeyRaw.IC.map(p => xdr.ScVal.scvBytes(serializeG1(p)))) }),
    ]);

    const initOp = contract.call("initialize",
        new Address(deployer.publicKey()).toScVal(),
        vkeyScVal
    );

    const initTx = new TransactionBuilder(account, { fee: "100000", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(initOp)
        .setTimeout(30)
        .build();

    initTx.sign(deployer);
    const initPrep = await server.prepareTransaction(initTx);
    initPrep.sign(deployer);
    const initRes = await server.sendTransaction(initPrep);
    await waitForTransaction(server, initRes.hash);

    console.log("✅ Initialization Verified.");
}

async function loadAccount(server, pk) {
    let retries = 15;
    while (retries-- > 0) {
        try { return await server.getAccount(pk); }
        catch (e) { await new Promise(r => setTimeout(r, 2000)); }
    }
    throw new Error("Account not found");
}

async function waitForTransaction(server, hash, returnResult = false) {
    let retries = 20;
    while (retries-- > 0) {
        const res = await server.getTransaction(hash);
        if (res.status === "SUCCESS") {
            if (returnResult) {
                // Extract return value from resultXdr
                const txMeta = xdr.TransactionMeta.fromXDR(res.resultMetaXdr, 'base64');
                const result = pkg.xdr.TransactionResult.fromXDR(res.resultXdr, 'base64');
                // Getting return value from createCustomContract is tricky, usually in return value of simulation or meta.
                // Actually, createCustomContract returns the Address.
                // result.result().results()[0].tr().createContractResult().contractId() ?
                // The invokeHostFunctionResult contains the return value.
                // For simplified script, I might parse simulation of deploy first?
                // Or easier: Address.contractIdFromAddress(deployer, salt)?
                // Let's assume we can parse it from logs or just use Address helper if possible.
                // Actually, the returnValue of the operation is the address.

                // Let's try to parse result info more deeply if needed, but for now returned value extraction might be hard without helper.
                // Wait, if I use `Address.fromScVal(result.result().results()[0].tr().invokeHostFunctionResult().success())`
                const val = txMeta.v3().sorobanMeta().returnValue();
                return val;
            }
            return true;
        }
        if (res.status === "FAILED") throw new Error("Tx Failed: " + res.hash);
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error("Timeout: " + hash);
}

main().catch(console.error);
