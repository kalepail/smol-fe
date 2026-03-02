import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Contract, Networks, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk/minimal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const RPC_URL = process.env.MAINNET_RPC_URL || "https://mainnet.sorobanrpc.com";
const NETWORK_PASSPHRASE =
  process.env.MAINNET_NETWORK_PASSPHRASE || "Public Global Stellar Network ; September 2015";

// Existing mainnet farm-attestations contract (SSOT, used by the app default config).
const CONTRACT_ID =
  process.env.FARM_ATTESTATIONS_CONTRACT_ID_MAINNET ||
  process.env.PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET ||
  "CDVJZSMI5KSRK7T6D6GGYVB6UPFCDQLAZAYRGXVJKDBOHLAZOPHHX2FR";

// Must be the on-chain admin of CONTRACT_ID.
const ADMIN_IDENTITY = process.env.ADMIN_IDENTITY || "batch-transfer-deployer";

// Keep <= 32 chars for Symbol.
const VK_ID = process.env.RISC0_GROTH16_VK_ID || "R0G16V1";

const VK_CONSTANTS_RS = path.join(
  rootDir,
  "contracts/risc0-groth16-verifier/src/vk_constants.rs",
);

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

function runInherit(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function getIdentityPubkey(identity) {
  return run(`stellar keys public-key ${identity}`, { cwd: rootDir }).trim();
}

function getIdentitySecret(identity) {
  // `stellar keys show` prints multiple lines; last line is secret.
  const out = run(`stellar keys show ${identity}`, { cwd: rootDir }).trim().split("\n");
  return out[out.length - 1].trim();
}

function getContractAdmin(contractId, identityForSim) {
  const out = run(
    `stellar contract invoke --id ${contractId} --source-account ${identityForSim} --send no --network mainnet --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" -- admin`,
    { cwd: rootDir },
  ).trim();
  return out.replaceAll('"', "").trim();
}

function parseU8Array(name, rsText) {
  // pub const NAME: [u8; N] = [ ... ];
  const re = new RegExp(`pub const ${name}: \\[u8; \\d+\\] = \\[([\\s\\S]*?)\\];`, "m");
  const m = rsText.match(re);
  if (!m) throw new Error(`Failed to find ${name} in vk_constants.rs`);
  const body = m[1];
  const bytes = [];
  for (const token of body.split(/[,\s]+/)) {
    if (!token) continue;
    if (!token.startsWith("0x")) continue;
    bytes.push(parseInt(token.slice(2), 16));
  }
  return Buffer.from(bytes);
}

function parseVkIc(rsText) {
  // Parse the VK_IC constant in a line-oriented way (more robust than regex).
  const start = rsText.indexOf("pub const VK_IC:");
  if (start === -1) throw new Error("Failed to find VK_IC in vk_constants.rs");
  const tail = rsText.slice(start);

  const rows = [];
  for (const line of tail.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("[0x")) continue;
    const body = t.replace(/^\[/, "").replace(/\],?$/, "");
    const bytes = [];
    for (const token of body.split(/[, ]+/)) {
      if (!token) continue;
      if (!token.startsWith("0x")) continue;
      bytes.push(parseInt(token.slice(2), 16));
    }
    if (bytes.length === 64) rows.push(Buffer.from(bytes));
    if (rows.length === 6) break;
  }

  if (rows.length !== 6) throw new Error(`Failed to parse VK_IC rows: got ${rows.length}`);
  return rows;
}

function scvBytes(buf) {
  return xdr.ScVal.scvBytes(buf);
}

function scvSymbol(sym) {
  return xdr.ScVal.scvSymbol(sym);
}

function scvMap(entries) {
  return xdr.ScVal.scvMap(entries);
}

function mapEntry(key, val) {
  return new xdr.ScMapEntry({ key: scvSymbol(key), val });
}

async function waitForTx(server, hash) {
  for (let i = 0; i < 50; i += 1) {
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

async function main() {
  console.log("Register VK: RISC0 Groth16 receipt -> farm-attestations (mainnet)");
  console.log(`Contract ID: ${CONTRACT_ID}`);
  console.log(`VK_ID: ${VK_ID}`);
  console.log(`Admin identity: ${ADMIN_IDENTITY}`);

  const adminPubkey = getIdentityPubkey(ADMIN_IDENTITY);
  const onchainAdmin = getContractAdmin(CONTRACT_ID, ADMIN_IDENTITY);
  console.log(`Admin pubkey: ${adminPubkey}`);
  console.log(`On-chain admin: ${onchainAdmin}`);
  if (adminPubkey !== onchainAdmin) {
    throw new Error("Refusing to register VK: local identity is not the on-chain admin.");
  }

  if (!fs.existsSync(VK_CONSTANTS_RS)) {
    throw new Error(`Missing ${VK_CONSTANTS_RS}. Run: node scripts/gen_risc0_groth16_vk.mjs`);
  }
  const rsText = fs.readFileSync(VK_CONSTANTS_RS, "utf8");

  const alpha = parseU8Array("VK_ALPHA_G1", rsText);
  const beta = parseU8Array("VK_BETA_G2", rsText);
  const gamma = parseU8Array("VK_GAMMA_G2", rsText);
  const delta = parseU8Array("VK_DELTA_G2", rsText);
  const icRows = parseVkIc(rsText);

  if (alpha.length !== 64 || beta.length !== 128 || gamma.length !== 128 || delta.length !== 128) {
    throw new Error(
      `VK lengths invalid: alpha=${alpha.length} beta=${beta.length} gamma=${gamma.length} delta=${delta.length}`,
    );
  }

  const vkVal = scvMap([
    mapEntry("alpha_g1", scvBytes(alpha)),
    mapEntry("beta_g2", scvBytes(beta)),
    mapEntry("delta_g2", scvBytes(delta)),
    mapEntry("gamma_g2", scvBytes(gamma)),
    mapEntry(
      "ic",
      xdr.ScVal.scvVec(icRows.map((b) => scvBytes(b))),
    ),
  ]);

  // NOTE: we use rpc + assemble + send directly here (admin ops, not passkey flow).
  const server = new rpc.Server(RPC_URL);

  const secret = getIdentitySecret(ADMIN_IDENTITY);
  const { Keypair, Account } = await import("@stellar/stellar-sdk/minimal");
  const kp = Keypair.fromSecret(secret);
  const account = await server.getAccount(kp.publicKey());

  const contract = new Contract(CONTRACT_ID);
  const op = contract.call("register_groth16_vk", scvSymbol(VK_ID), vkVal);

  const tx = new TransactionBuilder(account, {
    fee: "10000000", // 1 XLM for mainnet reliability
    networkPassphrase: NETWORK_PASSPHRASE || Networks.PUBLIC,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const assembled = rpc.assembleTransaction(tx, sim).build();
  assembled.sign(kp);

  const send = await server.sendTransaction(assembled);
  if (send.status !== "PENDING") {
    throw new Error(`Send failed: ${JSON.stringify(send)}`);
  }
  console.log(`Submitted: ${send.hash}`);

  const confirmed = await waitForTx(server, send.hash);
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Register failed: ${JSON.stringify(confirmed)}`);
  }
  console.log("VK registered successfully.");

  // Best-effort verify it exists (requires upgraded schema).
  try {
    runInherit(
      `stellar contract invoke --id ${CONTRACT_ID} --source-account ${ADMIN_IDENTITY} --send no --network mainnet --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" -- has_groth16_vk --vk_id ${VK_ID}`,
      { cwd: rootDir },
    );
  } catch {
    // ignore
  }

  console.log("\nNext step:");
  console.log("Set/keep these env vars for the app:");
  console.log("- PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET (optional; default already set)");
  console.log("- PUBLIC_MAINNET_RPC_URL (recommended)");
  console.log(`- (Dungeon) VK_ID assumed: ${VK_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
