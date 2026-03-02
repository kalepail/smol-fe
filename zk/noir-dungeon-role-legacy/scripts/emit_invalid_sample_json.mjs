import crypto from "node:crypto";
import fs from "node:fs";

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const [edgePath] = process.argv.slice(2);
if (!edgePath) throw new Error("usage: emit_invalid_sample_json.mjs <edgeSampleJson>");

const edge = JSON.parse(fs.readFileSync(edgePath, "utf8"));
const tampered = [...edge.proof.publicInputs];
tampered[0] = "0x" + (BigInt(tampered[0]) + 1n).toString(16).padStart(64, "0");

const invalid = {
  system: "noir",
  tier: "invalid",
  label: "Invalid (Tampered)",
  proof: {
    proofBase64: edge.proof.proofBase64,
    publicInputs: tampered,
  },
  publicInputs: tampered,
  commitmentDigest: edge.commitmentDigest,
  proofDigest: edge.proofDigest,
  verifierDigest: edge.verifierDigest,
  expectedValid: false,
};

process.stdout.write(JSON.stringify(invalid, null, 2));

