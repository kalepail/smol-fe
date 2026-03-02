import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Contract, Keypair, Networks, Operation, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk/minimal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Existing mainnet farm-attestations contract (SSOT, used by the app default config).
const DEFAULT_CONTRACT_ID =
  process.env.FARM_ATTESTATIONS_CONTRACT_ID_MAINNET ||
  process.env.PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET ||
  "CDVJZSMI5KSRK7T6D6GGYVB6UPFCDQLAZAYRGXVJKDBOHLAZOPHHX2FR";

// IMPORTANT: this is the current on-chain admin for the default contract ID (queried via `admin()`).
const DEFAULT_UPGRADER_IDENTITY = process.env.UPGRADER_IDENTITY || "batch-transfer-deployer";

const RPC_URL = process.env.MAINNET_RPC_URL || "https://mainnet.sorobanrpc.com";
const NETWORK_PASSPHRASE =
  process.env.MAINNET_NETWORK_PASSPHRASE || "Public Global Stellar Network ; September 2015";

const CONTRACT_DIR = "contracts/farm-attestations";
const WASM_SOURCE = `${CONTRACT_DIR}/target/wasm32v1-none/release/farm_attestations.wasm`;
const WASM_OPTIMIZED = `${CONTRACT_DIR}/target/wasm32v1-none/release/farm_attestations.optimized.wasm`;

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

function runInherit(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function sha256Hex(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function getIdentitySecret(identity) {
  // `stellar keys show` prints multiple lines; last line is secret.
  const out = run(`stellar keys show ${identity}`, { cwd: rootDir }).trim().split("\n");
  return out[out.length - 1].trim();
}

async function waitForTx(server, hash) {
  for (let i = 0; i < 60; i += 1) {
    const tx = await server.getTransaction(hash);
    if (
      tx.status === rpc.Api.GetTransactionStatus.SUCCESS ||
      tx.status === rpc.Api.GetTransactionStatus.FAILED
    ) {
      return tx;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for transaction confirmation");
}

async function sendPreparedTx({ server, tx, kp }) {
  tx.sign(kp);
  const send = await server.sendTransaction(tx);
  if (send.status !== "PENDING") {
    const resultName = send?.errorResult?._attributes?.result?._switch?.name;
    if (resultName === "txInsufficientBalance") {
      const feeCharged = Number(send?.errorResult?._attributes?.feeCharged?._value ?? 0);
      const xlm = feeCharged / 10_000_000;
      throw new Error(
        `txInsufficientBalance: upgrade requires ~${xlm.toFixed(2)} XLM available in the source account to cover fees/resources`,
      );
    }
    throw new Error(`Send failed: ${JSON.stringify(send)}`);
  }

  const confirmed = await waitForTx(server, send.hash);
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmed)}`);
  }

  return { hash: send.hash, confirmed };
}

function getIdentityPubkey(identity) {
  return run(`stellar keys public-key ${identity}`, { cwd: rootDir }).trim();
}

function getContractAdmin(contractId, identityForSim) {
  const out = run(
    `stellar contract invoke --id ${contractId} --source-account ${identityForSim} --send no --network mainnet --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" -- admin`,
    { cwd: rootDir },
  ).trim();
  return out.replaceAll('"', "").trim();
}

async function main() {
  const contractId = DEFAULT_CONTRACT_ID;
  const upgraderIdentity = DEFAULT_UPGRADER_IDENTITY;

  console.log("Upgrade: farm-attestations (mainnet)");
  console.log(`Contract ID: ${contractId}`);
  console.log(`Upgrader identity: ${upgraderIdentity}`);

  const upgraderPubkey = getIdentityPubkey(upgraderIdentity);
  console.log(`Upgrader pubkey: ${upgraderPubkey}`);

  const onchainAdmin = getContractAdmin(contractId, upgraderIdentity);
  console.log(`On-chain admin: ${onchainAdmin}`);

  if (onchainAdmin !== upgraderPubkey) {
    console.error("\nRefusing to upgrade: local identity is not the on-chain admin.");
    console.error("Fix: set UPGRADER_IDENTITY to the identity controlling the admin address.");
    process.exit(1);
  }

  // 1) Build
  runInherit("cargo build --target wasm32v1-none --release", {
    cwd: path.join(rootDir, CONTRACT_DIR),
  });

  // 2) Optimize
  runInherit(`stellar contract optimize --wasm "${WASM_SOURCE}" --wasm-out "${WASM_OPTIMIZED}"`, {
    cwd: rootDir,
  });

  // 3) Upload wasm (do NOT rely on stellar-cli submission; it can timeout even if RPC is fine).
  const wasmHash = sha256Hex(path.join(rootDir, WASM_OPTIMIZED));
  console.log(`WASM hash: ${wasmHash}`);

  const secret = getIdentitySecret(upgraderIdentity);
  const kp = Keypair.fromSecret(secret);
  const server = new rpc.Server(RPC_URL);

  console.log("\nUploading WASM...");
  let alreadyUploaded = false;
  try {
    await server.getContractWasmByHash(wasmHash);
    alreadyUploaded = true;
  } catch {
    // not uploaded yet
  }

  if (!alreadyUploaded) {
    const account = await server.getAccount(kp.publicKey());
    const uploadOp = Operation.uploadContractWasm({
      wasm: fs.readFileSync(path.join(rootDir, WASM_OPTIMIZED)),
    });

    const uploadTx = new TransactionBuilder(account, {
      fee: "10000000",
      networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
    })
      .addOperation(uploadOp)
      .setTimeout(60)
      .build();

    const prepared = await server.prepareTransaction(uploadTx);
    await sendPreparedTx({ server, tx: prepared, kp });
  } else {
    console.log("WASM already uploaded (hash exists on-chain).");
  }

  // 4) Upgrade (writes ledger, must send).
  console.log("\nUpgrading contract...");
  const account2 = await server.getAccount(kp.publicKey());
  const contract = new Contract(contractId);
  const op = contract.call("upgrade", xdr.ScVal.scvBytes(Buffer.from(wasmHash, "hex")));
  const upgradeTx = new TransactionBuilder(account2, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const preparedUpgrade = await server.prepareTransaction(upgradeTx);
  await sendPreparedTx({ server, tx: preparedUpgrade, kp });

  console.log("\nUpgrade complete.");
  console.log("Next steps:");
  console.log("1) Register VK(s): `node scripts/register-risc0-groth16-vk-mainnet.mjs`");
  console.log("2) Then Room 3 can do trustless on-chain verification via farm-attestations.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
