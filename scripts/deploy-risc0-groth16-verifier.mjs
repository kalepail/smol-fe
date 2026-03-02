import { execSync } from "child_process";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Contracts
const CONTRACT_DIR = "contracts/risc0-groth16-verifier";
const WASM_SOURCE = `${CONTRACT_DIR}/target/wasm32v1-none/release/risc0_groth16_verifier.wasm`;
const WASM_OPTIMIZED = `${CONTRACT_DIR}/target/wasm32v1-none/release/risc0_groth16_verifier.optimized.wasm`;

// Network
const RPC_URL = "https://mainnet.sorobanrpc.com";
const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

// Deployer identity (stellar-cli keys). Override with DEPLOYER_IDENTITY env var.
const DEPLOYER_IDENTITY = process.env.DEPLOYER_IDENTITY || "deployer";
const SECRET_PATH = "deployer_secret.txt";

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

function runInherit(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function parseHash(output) {
  const m = output.match(/[a-f0-9]{64}/);
  if (m) return m[0];
  const last = output.trim().split("\n").pop().trim();
  return last.length === 64 ? last : "";
}

async function main() {
  console.log("Deploy: risc0-groth16-verifier (mainnet)");
  console.log(`Identity: ${DEPLOYER_IDENTITY}`);

  // Best-effort: show deployer pubkey for funding instructions.
  let deployerAddress = "";
  try {
    deployerAddress = run(`stellar keys public-key ${DEPLOYER_IDENTITY}`, { cwd: rootDir }).trim();
    console.log(`Deployer address: ${deployerAddress}`);
  } catch {}

  // 1) Build wasm
  runInherit("cargo build --target wasm32v1-none --release", {
    cwd: path.join(rootDir, CONTRACT_DIR),
  });

  // 2) Optimize
  runInherit(`stellar contract optimize --wasm "${WASM_SOURCE}" --wasm-out "${WASM_OPTIMIZED}"`, {
    cwd: rootDir,
  });

  // 3) Install
  let installOut;
  try {
    installOut = run(
      `stellar contract install --wasm "${WASM_OPTIMIZED}" --source ${DEPLOYER_IDENTITY} --network mainnet --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}"`,
      { cwd: rootDir },
    );
  } catch (e) {
    console.error("\nInstall failed.\n");
    console.error(String(e?.stdout || e?.message || e));
    console.error("\nMost common cause: deployer needs more XLM on mainnet.");
    console.error("Fund the deployer address above and retry.");
    process.exit(1);
  }

  const wasmHash = parseHash(installOut);
  if (!wasmHash) {
    console.error("Failed to parse wasm hash from install output.");
    process.exit(1);
  }
  console.log(`WASM hash: ${wasmHash}`);

  // 4) Deploy
  let contractId;
  try {
    const deployOut = run(
      `stellar contract deploy --wasm-hash ${wasmHash} --source ${DEPLOYER_IDENTITY} --network mainnet --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}"`,
      { cwd: rootDir },
    );
    contractId = deployOut.trim().split("\n").pop().trim();
  } catch (e) {
    console.error("\nDeploy failed.\n");
    console.error(String(e?.stdout || e?.message || e));
    process.exit(1);
  }

  if (!contractId) {
    console.error("Failed to parse deployed contract ID.");
    process.exit(1);
  }

  console.log(`\nCONTRACT_ID=${contractId}`);
  writeFileSync(path.join(rootDir, "deployed-risc0-groth16-verifier-id.txt"), `${contractId}\n`, "utf8");

  // 5) Initialize admin (upgrade authority)
  if (deployerAddress) {
    try {
      runInherit(
        `stellar contract invoke --id ${contractId} --source-account ${DEPLOYER_IDENTITY} --network mainnet --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" -- --help`,
        { cwd: rootDir },
      );
    } catch {}

    try {
      runInherit(
        `stellar contract invoke --id ${contractId} --source-account ${DEPLOYER_IDENTITY} --network mainnet --rpc-url ${RPC_URL} --network-passphrase "${NETWORK_PASSPHRASE}" -- init_admin --admin ${deployerAddress}`,
        { cwd: rootDir },
      );
    } catch (e) {
      console.warn("\ninit_admin failed (contract may already be initialized).");
      console.warn(String(e?.stdout || e?.message || e));
    }
  }

  console.log("\nNext step:");
  console.log('Set `PUBLIC_RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET` to this contract ID (e.g. in .env).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
