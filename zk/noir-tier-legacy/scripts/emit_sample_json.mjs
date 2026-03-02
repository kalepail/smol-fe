import crypto from "node:crypto";
import fs from "node:fs";

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function bytesToHex32Strings(bytes) {
  if (bytes.length % 32 !== 0) throw new Error("public_inputs length must be multiple of 32");
  const out = [];
  for (let i = 0; i < bytes.length; i += 32) {
    out.push("0x" + Buffer.from(bytes.slice(i, i + 32)).toString("hex"));
  }
  return out;
}

const [tier, label, proofPath, pubInputsPath] = process.argv.slice(2);
if (!tier || !label || !proofPath || !pubInputsPath) {
  throw new Error("usage: emit_sample_json.mjs <tier> <label> <proofPath> <publicInputsPath>");
}

const proof = fs.readFileSync(proofPath);
const publicInputsBytes = fs.readFileSync(pubInputsPath);
const publicInputs = bytesToHex32Strings(publicInputsBytes);

const commitmentDigest = String(publicInputs[publicInputs.length - 1] ?? "");

const sample = {
  system: "noir",
  tier,
  label,
  proof: {
    proofBase64: proof.toString("base64"),
    publicInputs,
  },
  publicInputs,
  commitmentDigest,
  proofDigest: sha256Hex(proof),
  verifierDigest: "legacy-bb-v0.87.0-keccak", // stable label; actual vk digest is stored in bundle.
  expectedValid: true,
};

process.stdout.write(JSON.stringify(sample, null, 2));

