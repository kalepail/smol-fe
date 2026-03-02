import { readFileSync } from 'fs';
import { Keypair, Contract, rpc, TransactionBuilder, Networks, xdr, Address, nativeToScVal } from '@stellar/stellar-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Constants
const VKEY_PATH = "public/zk/verification_key.json";
// Testnet Contract ID
const CONTRACT_ID = "CDPACZDP7LZ4BEHVG64EAEOOGNTJS5V4WB2JGMZ4I6FK2GCAYVO7LRCC";
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

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

async function fundWithFriendbot(publicKey) {
    try {
        const res = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
        const json = await res.json();
        console.log("Friendbot:", json);
    } catch (e) {
        console.error("Friendbot failed:", e);
    }
}

async function main() {
    console.log("🚀 Initializing Tier Verifier (TESTNET)...");

    // 1. Generate random admin
    const source = Keypair.random();
    console.log("Generated Admin:", source.publicKey());

    // 2. Fund it
    await fundWithFriendbot(source.publicKey());

    // 3. Load VKey
    const vkeyRaw = JSON.parse(readFileSync(path.resolve(rootDir, VKEY_PATH), 'utf8'));

    const vkeyScVal = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("alpha_g1"), val: xdr.ScVal.scvBytes(serializeG1(vkeyRaw.vk_alpha_1)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("beta_g2"), val: xdr.ScVal.scvBytes(serializeG2(vkeyRaw.vk_beta_2)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("delta_g2"), val: xdr.ScVal.scvBytes(serializeG2(vkeyRaw.vk_delta_2)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("gamma_g2"), val: xdr.ScVal.scvBytes(serializeG2(vkeyRaw.vk_gamma_2)) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic"), val: xdr.ScVal.scvVec(vkeyRaw.IC.map(p => xdr.ScVal.scvBytes(serializeG1(p)))) }),
    ]);

    // 4. Initialize
    const server = new rpc.Server(RPC_URL);
    const contract = new Contract(CONTRACT_ID);
    const adminAddress = new Address(source.publicKey());

    const op = contract.call("initialize",
        adminAddress.toScVal(),
        vkeyScVal
    );

    let account;
    let attempts = 0;
    while (!account && attempts < 20) {
        try {
            account = await server.getAccount(source.publicKey());
            console.log("Account found!");
        } catch (e) {
            console.log("Waiting for account indexing...");
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }
    }

    if (!account) {
        throw new Error("Account not found after retries");
    }

    const tx = new TransactionBuilder(account, {
        fee: "10000",
        networkPassphrase: NETWORK_PASSPHRASE
    })
        .addOperation(op)
        .setTimeout(30)
        .build();

    console.log("Preparing transaction...");
    const preparedTx = await server.prepareTransaction(tx);

    preparedTx.sign(source);

    console.log("Submitting initialization...");
    const result = await server.sendTransaction(preparedTx);

    if (result.status === "PENDING") {
        console.log("PENDING:", result.hash);
        // poll
        let status = result.status;
        let retries = 0;
        while (status === "PENDING" && retries < 10) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const r = await server.getTransaction(result.hash);
                status = r.status;
                console.log("Status:", status);
            } catch (e) {
                console.log("Polling error:", e.message);
            }
        }
    } else {
        console.log("Result FAILED:", JSON.stringify(result, null, 2));
        // Try to decode expected error
        if (result.errorResultXdr) {
            console.log("Error XDR:", result.errorResultXdr);
        }
    }
}

main().catch(console.error);
