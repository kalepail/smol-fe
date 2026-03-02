import http from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const PORT = Number(process.env.PROVER_PORT || "8788");
const BIND = String(process.env.PROVER_BIND || "127.0.0.1");
const API_KEY = String(process.env.PROVER_API_KEY || "").trim();
const IS_WIN = process.platform === "win32";

function windowsPathToWslPath(p) {
  // C:\Users\Jeff\Mixtape Auto\smol-fe -> /mnt/c/Users/Jeff/Mixtape Auto/smol-fe
  const match = /^([a-zA-Z]):\\(.*)$/.exec(p);
  if (!match) return p;
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

function bashSingleQuote(s) {
  // Safest simple quoting for bash -lc strings.
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function sendJson(res, status, obj, origin) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  // Basic CORS for local dev (this server is intended to be called via same-origin proxy in prod).
  res.setHeader("access-control-allow-origin", origin || "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function handleNoirRole(body) {
  const requiredRole = Number(body?.requiredRole);
  const role = Number(body?.role);
  const salt = String(body?.salt ?? "");

  if (!Number.isFinite(requiredRole) || requiredRole < 0 || requiredRole > 10_000_000) {
    throw new Error("Invalid requiredRole");
  }
  if (!Number.isFinite(role) || role < 0 || role > 10_000_000) {
    throw new Error("Invalid role");
  }
  if (!salt || salt.length > 200) {
    throw new Error("Invalid salt");
  }

  const rootFs = IS_WIN ? windowsPathToWslPath(rootDir) : rootDir;
  const noirDir = IS_WIN ? `${rootFs}/zk/noir-dungeon-role-legacy` : path.join(rootFs, "zk", "noir-dungeon-role-legacy");
  const cmd = [
    `cd ${bashSingleQuote(noirDir)}`,
    IS_WIN
      ? `bash scripts/prove_one_wsl.sh ${requiredRole} ${role} ${bashSingleQuote(salt)}`
      : `bash scripts/prove_one.sh ${requiredRole} ${role} ${bashSingleQuote(salt)}`,
  ].join(" && ");

  const { stdout } = await execFileAsync(IS_WIN ? "wsl" : "bash", IS_WIN ? ["bash", "-lc", cmd] : ["-lc", cmd], {
    timeout: 6 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(String(stdout).trim());
}

async function handleRisc0Groth16(body) {
  const tierIndex = Number(body?.tierIndex);
  const threshold = Number(body?.threshold);
  const balance = Number(body?.balance);
  const saltByte = Number(body?.saltByte);

  if (!Number.isFinite(tierIndex) || tierIndex < 0 || tierIndex > 255) throw new Error("Invalid tierIndex");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > Number.MAX_SAFE_INTEGER) throw new Error("Invalid threshold");
  if (!Number.isFinite(balance) || balance < 0 || balance > Number.MAX_SAFE_INTEGER) throw new Error("Invalid balance");
  if (!Number.isFinite(saltByte) || saltByte < 0 || saltByte > 255) throw new Error("Invalid saltByte");

  const rootFs = IS_WIN ? windowsPathToWslPath(rootDir) : rootDir;
  const risc0Dir = IS_WIN ? `${rootFs}/zk/risc0-tier/host` : path.join(rootFs, "zk", "risc0-tier", "host");
  // IMPORTANT: the RISC0 Groth16 shrink-wrap step uses Docker bind-mounts.
  // When the Docker engine is not running inside the same WSL distro, bind-mounting
  // WSL-only paths (like /tmp) can appear empty inside the container. To make this
  // reliable, we force the work dir to a Windows-mounted path under the repo.
  const workDir = IS_WIN
    ? `${rootFs}/.tmp/risc0_groth16_work/${crypto.randomUUID()}`
    : path.join(rootFs, ".tmp", "risc0_groth16_work", crypto.randomUUID());
  // Avoid `cargo run` every time: build once then execute the binary.
  // This dramatically reduces per-request latency after the first run.
  const cmd = [
    `mkdir -p ${bashSingleQuote(workDir)}`,
    `cd ${bashSingleQuote(risc0Dir)}`,
    // Force a stable target dir under this package (avoids workspace-level target paths).
    `if [ ! -x target/release/prove_groth16 ]; then RISC0_DEV_MODE=0 cargo build --quiet --release --bin prove_groth16 --target-dir target; fi`,
    `RISC0_WORK_DIR=${bashSingleQuote(workDir)} RISC0_DEV_MODE=0 ./target/release/prove_groth16 ${tierIndex} ${threshold} ${balance} ${saltByte}`,
  ].join(" && ");

  const { stdout } = await execFileAsync(IS_WIN ? "wsl" : "bash", IS_WIN ? ["bash", "-lc", cmd] : ["-lc", cmd], {
    timeout: Number(process.env.RISC0_PROVER_TIMEOUT_MS || String(45 * 60 * 1000)),
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(String(stdout).trim());
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("access-control-allow-origin", origin || "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,authorization");
    res.end();
    return;
  }

  try {
    if (API_KEY) {
      const auth = String(req.headers.authorization || "");
      if (auth !== `Bearer ${API_KEY}`) {
        sendJson(res, 401, { ok: false, error: "unauthorized" }, origin);
        return;
      }
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true }, origin);
      return;
    }

    if (req.method === "POST" && req.url === "/noir-ultrahonk-role") {
      const body = await readJson(req);
      const sample = await handleNoirRole(body);
      sendJson(res, 200, { ok: true, sample }, origin);
      return;
    }

    if (req.method === "POST" && req.url === "/risc0-groth16") {
      const body = await readJson(req);
      const proof = await handleRisc0Groth16(body);
      sendJson(res, 200, { ok: true, proof }, origin);
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" }, origin);
  } catch (e) {
    sendJson(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }, origin);
  }
});

server.listen(PORT, BIND, () => {
  console.log(`[prover] listening on http://${BIND}:${PORT}`);
  if (API_KEY) console.log("[prover] auth: Authorization: Bearer <PROVER_API_KEY> required");
  console.log("[prover] routes:");
  console.log("  GET  /health");
  console.log("  POST /noir-ultrahonk-role");
  console.log("  POST /risc0-groth16");
});
