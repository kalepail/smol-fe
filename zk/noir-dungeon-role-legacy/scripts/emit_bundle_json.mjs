import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const [vkPath, samplesDir] = process.argv.slice(2);
if (!vkPath || !samplesDir) throw new Error("usage: emit_bundle_json.mjs <vkPath> <samplesDir>");

const vkBytes = fs.readFileSync(vkPath);
const vkDigest = sha256Hex(vkBytes);

const sampleFiles = fs
  .readdirSync(samplesDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

const samples = sampleFiles.map((f) => JSON.parse(fs.readFileSync(path.join(samplesDir, f), "utf8")));

// Normalize verifierDigest to a stable 32-byte hex (sha256(vkBytes)).
for (const s of samples) {
  s.verifierDigest = "0x" + vkDigest;
}

const bundle = {
  system: "noir",
  commitmentScheme: "pedersen(balance,salt)",
  verifier: {
    backend: "ultrahonk",
    vkBase64: vkBytes.toString("base64"),
    vkDigest,
    oracleHash: "keccak",
    bbVersion: "v0.87.0",
  },
  samples,
};

process.stdout.write(JSON.stringify(bundle, null, 2));
