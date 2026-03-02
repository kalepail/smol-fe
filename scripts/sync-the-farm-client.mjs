import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const smolRoot = resolve(__dirname, "..");
const workspaceRoot = resolve(smolRoot, "..");
const sgsFrontend = resolve(workspaceRoot, "Stellar-Game-Studio-1", "the-farm-frontend");
const sgsDist = resolve(sgsFrontend, "dist");
const targetDir = resolve(smolRoot, "public", "labs", "the-farm", "client");

if (process.env.SKIP_THE_FARM_CLIENT_SYNC === "1") {
  console.log("[the-farm-sync] SKIP_THE_FARM_CLIENT_SYNC=1, skipping sync.");
  process.exit(0);
}

if (!existsSync(sgsFrontend)) {
  console.warn(`[the-farm-sync] SGS frontend not found at ${sgsFrontend}. Keeping existing static client bundle.`);
  process.exit(0);
}

console.log("[the-farm-sync] Building SGS the-farm frontend...");
execSync("bun run build", {
  cwd: sgsFrontend,
  stdio: "inherit",
});

if (!existsSync(sgsDist)) {
  console.error(`[the-farm-sync] Build completed but dist directory not found: ${sgsDist}`);
  process.exit(1);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sgsDist, targetDir, { recursive: true });

console.log(`[the-farm-sync] Synced ${sgsDist} -> ${targetDir}`);
