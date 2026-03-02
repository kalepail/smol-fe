import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Contract, Keypair, Networks, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk/minimal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const RPC_URL = process.env.MAINNET_RPC_URL || "https://mainnet.sorobanrpc.com";
const NETWORK_PASSPHRASE = process.env.MAINNET_NETWORK_PASSPHRASE || "Public Global Stellar Network ; September 2015";

const CONTRACT_ID =
  process.env.ULTRAHONK_VERIFIER_CONTRACT_ID_MAINNET ||
  process.env.PUBLIC_ULTRAHONK_VERIFIER_CONTRACT_ID_MAINNET ||
  (fs.existsSync(path.join(rootDir, "deployed-ultrahonk-verifier-id.txt"))
    ? fs.readFileSync(path.join(rootDir, "deployed-ultrahonk-verifier-id.txt"), "utf8").trim()
    : "");

// IMPORTANT: must match on-chain `admin()` for the verifier contract.
const ADMIN_IDENTITY = process.env.ADMIN_IDENTITY || process.env.UPGRADER_IDENTITY || "batch-transfer-deployer";

const VK_PATH = process.env.NOIR_VK_PATH || "zk/noir-dungeon-role-legacy/artifacts/vk";
const VK_ID = (process.env.NOIR_VK_ID || "NOIR_ROLE_V1").slice(0, 32);
const SET_DEFAULT = String(process.env.SET_DEFAULT_VK_ID || "0") === "1";

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
  const out = run(`stellar keys show ${identity}`, { cwd: rootDir }).trim().split("\n");
  return out[out.length - 1].trim();
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

async function waitForTx(server, hash) {
  for (let i = 0; i < 60; i += 1) {
    const tx = await server.getTransaction(hash);
    if (tx.status === rpc.Api.GetTransactionStatus.SUCCESS || tx.status === rpc.Api.GetTransactionStatus.FAILED) {
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
    throw new Error(`Send failed: ${JSON.stringify(send)}`);
  }

  const confirmed = await waitForTx(server, send.hash);
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmed)}`);
  }
  return { hash: send.hash, confirmed };
}

async function main() {
  if (!CONTRACT_ID) {
    throw new Error("Missing ultrahonk-verifier contract ID (set ULTRAHONK_VERIFIER_CONTRACT_ID_MAINNET).");
  }

  const vkAbs = path.isAbsolute(VK_PATH) ? VK_PATH : path.join(rootDir, VK_PATH);
  if (!fs.existsSync(vkAbs)) {
    throw new Error(`VK file not found: ${vkAbs}`);
  }

  console.log("Register VK: ultrahonk-verifier (mainnet)");
  console.log(`Contract ID: ${CONTRACT_ID}`);
  console.log(`Admin identity: ${ADMIN_IDENTITY}`);
  console.log(`VK_ID: ${VK_ID}`);
  console.log(`VK_PATH: ${VK_PATH}`);
  console.log(`VK sha256: ${sha256Hex(vkAbs)}`);

  const adminPubkey = getIdentityPubkey(ADMIN_IDENTITY);
  const onchainAdmin = getContractAdmin(CONTRACT_ID, ADMIN_IDENTITY);
  console.log(`Admin pubkey: ${adminPubkey}`);
  console.log(`On-chain admin: ${onchainAdmin}`);

  if (onchainAdmin !== adminPubkey) {
    console.error("\nRefusing to register VK: local identity is not the on-chain admin.");
    process.exit(1);
  }

  // Make sure contract WASM is built/optimized locally (not required for VK set, but keeps scripts consistent).
  // Users can skip this if they prefer; it doesn't touch chain state.
  try {
    runInherit("stellar --version", { cwd: rootDir });
  } catch {}

  const secret = getIdentitySecret(ADMIN_IDENTITY);
  const kp = Keypair.fromSecret(secret);
  const server = new rpc.Server(RPC_URL);

  const vkBytes = fs.readFileSync(vkAbs);

  const contract = new Contract(CONTRACT_ID);
  const account = await server.getAccount(kp.publicKey());

  const ops = [contract.call("set_vk_by_id", xdr.ScVal.scvSymbol(VK_ID), xdr.ScVal.scvBytes(vkBytes))];
  if (SET_DEFAULT) {
    ops.push(contract.call("set_default_vk_id", xdr.ScVal.scvSymbol(VK_ID)));
  }

  const builder = new TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
  });

  for (const op of ops) builder.addOperation(op);

  const tx = builder.setTimeout(60).build();

  const prepared = await server.prepareTransaction(tx);
  const sent = await sendPreparedTx({ server, tx: prepared, kp });
  console.log(`\n✅ VK registered. tx=${sent.hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
