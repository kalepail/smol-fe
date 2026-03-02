#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const outDir = path.join(root, "artifacts");
const samplesDir = path.join(outDir, "samples");
const bundlePath = path.join(outDir, "bundle.json");

const vk = JSON.parse(fs.readFileSync(path.join(outDir, "verification_key.json"), "utf8"));
const names = ["sprout", "grower", "harvester", "whale", "edge", "invalid"];
const bundle = { verificationKey: vk, samples: {} };
for (const n of names) {
  const proof = JSON.parse(fs.readFileSync(path.join(samplesDir, `proof_${n}.json`), "utf8"));
  const pub = JSON.parse(fs.readFileSync(path.join(samplesDir, `public_${n}.json`), "utf8"));
  bundle.samples[n] = { proof, publicSignals: pub }; // snarkjs emits array
}
fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
console.log("wrote", bundlePath);
