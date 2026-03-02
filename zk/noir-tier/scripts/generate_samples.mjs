import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const artifactPath = path.join(root, "target", "the_farm_noir.json");
const artifactsDir = path.join(root, "artifacts");
const samplesDir = path.join(artifactsDir, "samples");

const tierConfigs = [
  { tier: "sprout", label: "Sprout Threshold", threshold: "0", balance: "42", salt: "11" },
  { tier: "grower", label: "Grower Threshold", threshold: "100", balance: "220", salt: "22" },
  { tier: "harvester", label: "Harvester Threshold", threshold: "1000", balance: "2200", salt: "33" },
  { tier: "whale", label: "Whale Threshold", threshold: "10000", balance: "20000", salt: "44" },
  { tier: "edge", label: "Edge Threshold", threshold: "100", balance: "100", salt: "55" },
];

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

async function main() {
  await fs.mkdir(samplesDir, { recursive: true });

  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  const noir = new Noir(artifact);
  const backend = new UltraHonkBackend(artifact.bytecode, { threads: 1 });

  try {
    const samples = [];

    for (const cfg of tierConfigs) {
      const execution = await noir.execute({
        threshold: cfg.threshold,
        balance: cfg.balance,
        salt: cfg.salt,
      });

      const proofData = await backend.generateProof(execution.witness);
      const verified = await backend.verifyProof(proofData);
      if (!verified) {
        throw new Error(`generated Noir proof did not verify (${cfg.tier})`);
      }

      const proofBase64 = Buffer.from(proofData.proof).toString("base64");
      const commitmentDigest = String(proofData.publicInputs[proofData.publicInputs.length - 1] ?? "");
      const proofDigest = sha256Hex(proofData.proof);

      const sample = {
        system: "noir",
        tier: cfg.tier,
        label: cfg.label,
        proof: {
          proofBase64,
          publicInputs: proofData.publicInputs,
        },
        publicInputs: proofData.publicInputs,
        commitmentDigest,
        proofDigest,
        verifierDigest: sha256Hex(Buffer.from(artifact.bytecode, "base64")),
        expectedValid: true,
      };

      samples.push(sample);
      await fs.writeFile(
        path.join(samplesDir, `${cfg.tier}.json`),
        JSON.stringify(sample, null, 2),
        "utf8",
      );
    }

    const edgeSample = samples.find((item) => item.tier === "edge");
    if (!edgeSample) {
      throw new Error("edge sample not found");
    }

    const tamperedPublicInputs = [...edgeSample.proof.publicInputs];
    tamperedPublicInputs[0] = String(BigInt(tamperedPublicInputs[0]) + 1n);

    const invalidSample = {
      system: "noir",
      tier: "invalid",
      label: "Invalid (Tampered)",
      proof: {
        proofBase64: edgeSample.proof.proofBase64,
        publicInputs: tamperedPublicInputs,
      },
      publicInputs: tamperedPublicInputs,
      commitmentDigest: edgeSample.commitmentDigest,
      proofDigest: edgeSample.proofDigest,
      verifierDigest: edgeSample.verifierDigest,
      expectedValid: false,
    };

    samples.push(invalidSample);
    await fs.writeFile(
      path.join(samplesDir, "invalid.json"),
      JSON.stringify(invalidSample, null, 2),
      "utf8",
    );

    const bundle = {
      system: "noir",
      commitmentScheme: "pedersen(balance,salt)",
      verifier: {
        backend: "ultrahonk",
        bytecode: artifact.bytecode,
        abi: artifact.abi ?? null,
        digest: sha256Hex(Buffer.from(artifact.bytecode, "base64")),
      },
      samples,
    };

    await fs.writeFile(path.join(artifactsDir, "bundle.json"), JSON.stringify(bundle, null, 2), "utf8");
  } finally {
    await backend.destroy();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
