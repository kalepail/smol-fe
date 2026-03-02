import legacyBundleJson from "./noir_ultrahonk_legacy_bundle.json";

export type NoirLegacySample = {
  system: "noir";
  tier: "sprout" | "grower" | "harvester" | "whale" | "edge" | "invalid";
  label: string;
  proof: { proofBase64: string; publicInputs: string[] };
  publicInputs: string[];
  commitmentDigest: string;
  proofDigest: string;
  verifierDigest: string;
  expectedValid: boolean;
};

type NoirLegacyBundle = {
  system: "noir";
  commitmentScheme: string;
  verifier: {
    backend: "ultrahonk";
    vkBase64: string;
    vkDigest: string; // sha256 hex
    oracleHash: "keccak";
    bbVersion: string;
  };
  samples: NoirLegacySample[];
};

export const noirUltraHonkLegacyBundle = legacyBundleJson as NoirLegacyBundle;

export const noirUltraHonkLegacySamples = noirUltraHonkLegacyBundle.samples;
export const noirUltraHonkLegacyVkDigestHex = `0x${noirUltraHonkLegacyBundle.verifier.vkDigest}`;

