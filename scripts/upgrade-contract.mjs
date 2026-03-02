import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import pkg from '@stellar/stellar-sdk';
const { Keypair, Contract, rpc, TransactionBuilder, Networks, xdr, Address } = pkg;

const WASM_PATH = "contracts/tier-verifier/target/wasm32-unknown-unknown/release/tier_verifier.optimized.wasm";
const CONTRACT_ID = "CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M";
const RPC_URL = "https://mainnet.sorobanrpc.com";
const DEPLOYER_IDENTITY = "tier-verifier-deployer";

async function upgrade() {
    console.log(`🚀 Starting upgrade for contract: ${CONTRACT_ID}`);

    // 1. Get Secret
    const secret = execSync(`stellar keys show ${DEPLOYER_IDENTITY}`, { encoding: 'utf8' }).trim().split('\n').pop().trim();
    const kp = Keypair.fromSecret(secret);
    const server = new rpc.Server(RPC_URL);

    // 2. Install WASM
    console.log("📤 Installing WASM...");
    const installCmd = `stellar contract install --wasm "${WASM_PATH}" --source ${DEPLOYER_IDENTITY} --network mainnet --rpc-url ${RPC_URL} --network-passphrase "Public Global Stellar Network ; September 2015"`;
    const installOutput = execSync(installCmd, { encoding: 'utf8' });
    const match = installOutput.match(/([a-f0-9]{64})/);
    const wasmHash = match ? match[1] : installOutput.trim().split('\n').pop().trim();
    console.log(`✅ WASM Hash: ${wasmHash}`);

    // 3. Call Upgrade
    console.log("🛠️  Submitting upgrade transaction...");
    const account = await server.getAccount(kp.publicKey());
    const contract = new Contract(CONTRACT_ID);

    const op = contract.call("upgrade",
        xdr.ScVal.scvBytes(Buffer.from(wasmHash, 'hex'))
    );

    const tx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: Networks.PUBLIC
    })
        .addOperation(op)
        .setTimeout(60)
        .build();

    tx.sign(kp);
    const preparedTx = await server.prepareTransaction(tx);
    preparedTx.sign(kp);
    const result = await server.sendTransaction(preparedTx);

    console.log(`✅ Upgrade TX: ${result.hash}`);

    // Wait for success
    let status = await server.getTransaction(result.hash);
    while (status.status === "NOT_FOUND" || status.status === "PENDING") {
        await new Promise(r => setTimeout(r, 2000));
        status = await server.getTransaction(result.hash);
    }

    if (status.status === "SUCCESS") {
        console.log("🎉 Contract upgraded successfully with diagnostics!");
    } else {
        console.error("❌ Upgrade failed:", JSON.stringify(status, null, 2));
    }
}

upgrade().catch(console.error);
