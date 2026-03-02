import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UltraHonkBackend } from "@aztec/bb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const bundlePath = path.join(root, "artifacts", "bundle.json");

async function main() {
  const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8"));
  const backend = new UltraHonkBackend(bundle.verifier.bytecode, { threads: 1 });
  let hasFailure = false;

  try {
    for (const sample of bundle.samples) {
      const proof = Uint8Array.from(Buffer.from(sample.proof.proofBase64, "base64"));
      const verified = await backend.verifyProof({
        proof,
        publicInputs: sample.proof.publicInputs,
      });

      if (sample.expectedValid && verified) {
        process.stdout.write(`PASS ${sample.tier}\n`);
      } else if (!sample.expectedValid && !verified) {
        process.stdout.write(`FAIL ${sample.tier} (expected)\n`);
      } else {
        hasFailure = true;
        process.stderr.write(`MISMATCH ${sample.tier}: expected ${sample.expectedValid}, got ${verified}\n`);
      }
    }
  } finally {
    await backend.destroy();
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
