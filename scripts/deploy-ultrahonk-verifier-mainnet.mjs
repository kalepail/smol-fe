import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  Address,
  Contract,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  hash,
  rpc,
  xdr,
} from "@stellar/stellar-sdk/minimal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const RPC_URL = process.env.MAINNET_RPC_URL || "https://mainnet.sorobanrpc.com";
const NETWORK_PASSPHRASE =
  process.env.MAINNET_NETWORK_PASSPHRASE || "Public Global Stellar Network ; September 2015";

const ADMIN_IDENTITY = process.env.ADMIN_IDENTITY || "batch-transfer-deployer";

const FARM_ATTESTATIONS_ID =
  process.env.FARM_ATTESTATIONS_CONTRACT_ID_MAINNET ||
  process.env.PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET ||
  "CDVJZSMI5KSRK7T6D6GGYVB6UPFCDQLAZAYRGXVJKDBOHLAZOPHHX2FR";

const CONTRACT_DIR = "contracts/ultrahonk-verifier";
const WASM_SOURCE = `${CONTRACT_DIR}/target/wasm32v1-none/release/ultrahonk_verifier.wasm`;
const WASM_OPTIMIZED = `${CONTRACT_DIR}/target/wasm32v1-none/release/ultrahonk_verifier.optimized.wasm`;

// Default to the legacy UltraHonk VK format that the on-chain verifier supports.
// This must match the proof artifacts used by `publishNoirUltraHonkVerifyMainnet`.
const VK_PATH = process.env.NOIR_VK_PATH || "zk/noir-tier-legacy/artifacts/vk";
// Keep <= 32 chars for Soroban Symbol.
const VK_ID = process.env.NOIR_VK_ID || "NOIR_TIER_V1";

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

function getIdentityPubkey(identity) {
  return run(`stellar keys public-key ${identity}`, { cwd: rootDir }).trim();
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
        `txInsufficientBalance: upload/deploy requires ~${xlm.toFixed(2)} XLM available in the source account to cover fees/resources`,
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

function computeContractIdFromAddressSalt({ networkPassphrase, adminPubkey, salt }) {
  const networkId = hash(Buffer.from(networkPassphrase || Networks.PUBLIC));
  const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: new Address(adminPubkey).toScAddress(),
      salt,
    }),
  );
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({ networkId, contractIdPreimage }),
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

async function main() {
  console.log("Deploy: ultrahonk-verifier (mainnet)");
  console.log(`Admin identity: ${ADMIN_IDENTITY}`);
  console.log(`Farm attestations: ${FARM_ATTESTATIONS_ID}`);
  console.log(`VK path: ${VK_PATH}`);

  const adminPubkey = getIdentityPubkey(ADMIN_IDENTITY);
  console.log(`Admin pubkey: ${adminPubkey}`);

  const vkAbs = path.join(rootDir, VK_PATH);
  if (!fs.existsSync(vkAbs)) {
    throw new Error(`Missing VK file: ${vkAbs}`);
  }

  // 1) Build
  runInherit("cargo build --target wasm32v1-none --release", {
    cwd: path.join(rootDir, CONTRACT_DIR),
  });

  // 2) Optimize
  runInherit(`stellar contract optimize --wasm "${WASM_SOURCE}" --wasm-out "${WASM_OPTIMIZED}"`, {
    cwd: rootDir,
  });

  const wasmHash = sha256Hex(path.join(rootDir, WASM_OPTIMIZED));
  console.log(`WASM hash: ${wasmHash}`);

  const secret = getIdentitySecret(ADMIN_IDENTITY);
  const kp = Keypair.fromSecret(secret);
  const server = new rpc.Server(RPC_URL);

  // 3) Upload wasm (no-op if already present by hash)
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

    console.log("\nUploading WASM...");
    const prepared = await server.prepareTransaction(uploadTx);
    await sendPreparedTx({ server, tx: prepared, kp });
  } else {
    console.log("WASM already uploaded (hash exists on-chain).");
  }

  // 4) Deploy contract instance
  const salt = crypto.randomBytes(32);
  const contractId = computeContractIdFromAddressSalt({
    networkPassphrase: NETWORK_PASSPHRASE,
    adminPubkey,
    salt,
  });
  console.log(`Contract ID: ${contractId}`);

  const account2 = await server.getAccount(kp.publicKey());
  const deployOp = Operation.createCustomContract({
    address: new Address(adminPubkey),
    wasmHash: Buffer.from(wasmHash, "hex"),
    salt,
  });
  const deployTx = new TransactionBuilder(account2, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
  })
    .addOperation(deployOp)
    .setTimeout(60)
    .build();

  console.log("\nDeploying contract...");
  const preparedDeploy = await server.prepareTransaction(deployTx);
  await sendPreparedTx({ server, tx: preparedDeploy, kp });

  // 5) Init admin
  const verifier = new Contract(contractId);
  const account3 = await server.getAccount(kp.publicKey());
  const initOp = verifier.call("init_admin", new Address(adminPubkey).toScVal());
  const initTx = new TransactionBuilder(account3, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
  })
    .addOperation(initOp)
    .setTimeout(60)
    .build();

  console.log("\nInitializing admin...");
  const preparedInit = await server.prepareTransaction(initTx);
  await sendPreparedTx({ server, tx: preparedInit, kp });

  // 6) Set VK
  const vkBytes = fs.readFileSync(vkAbs);
  const account4 = await server.getAccount(kp.publicKey());
  // Prefer the multi-circuit VK registry. Also set the legacy single VK key for backwards-compat.
  const setVkByIdOp = verifier.call(
    "set_vk_by_id",
    xdr.ScVal.scvSymbol(VK_ID),
    xdr.ScVal.scvBytes(vkBytes),
  );
  const setDefaultVkOp = verifier.call("set_default_vk_id", xdr.ScVal.scvSymbol(VK_ID));
  const setLegacyVkOp = verifier.call("set_vk", xdr.ScVal.scvBytes(vkBytes));

  const setVkTx = new TransactionBuilder(account4, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
  })
    .addOperation(setVkByIdOp)
    .addOperation(setDefaultVkOp)
    .addOperation(setLegacyVkOp)
    .setTimeout(60)
    .build();

  console.log(`\nSetting verifier VK (vk_id=${VK_ID})...`);
  const preparedSetVk = await server.prepareTransaction(setVkTx);
  await sendPreparedTx({ server, tx: preparedSetVk, kp });

  // 7) Wire farm-attestations -> ultrahonk-verifier
  const farm = new Contract(FARM_ATTESTATIONS_ID);
  const account5 = await server.getAccount(kp.publicKey());
  const wireOp = farm.call("set_ultrahonk_verifier", new Address(contractId).toScVal());
  const wireTx = new TransactionBuilder(account5, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
  })
    .addOperation(wireOp)
    .setTimeout(60)
    .build();

  console.log("\nWiring farm-attestations -> ultrahonk-verifier...");
  const preparedWire = await server.prepareTransaction(wireTx);
  await sendPreparedTx({ server, tx: preparedWire, kp });

  fs.writeFileSync(path.join(rootDir, "deployed-ultrahonk-verifier-id.txt"), `${contractId}\n`);

  console.log("\nDone.");
  console.log(`ultrahonk-verifier: ${contractId}`);
  console.log("Recorded to deployed-ultrahonk-verifier-id.txt");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
