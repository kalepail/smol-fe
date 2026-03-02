import bundleJson from "./noir.bundle.json";
import type { FarmSampleProof, Tier } from "../../lib/the-farm/types";

type NoirProofPayload = {
  proofBase64: string;
  publicInputs: string[];
};

type NoirRawSample = {
  system: "noir";
  tier: Tier;
  label: string;
  proof: NoirProofPayload;
  publicInputs: string[];
  commitmentDigest: string;
  proofDigest: string;
  verifierDigest: string;
  expectedValid: boolean;
};

type NoirRawBundle = {
  system: "noir";
  commitmentScheme: string;
  verifier: {
    backend: string;
    bytecode: string;
    digest: string;
  };
  samples: NoirRawSample[];
};

const rawBundle = bundleJson as NoirRawBundle;

export const noirVerifierBytecode = rawBundle.verifier.bytecode;
export const noirVerifierDigest = rawBundle.verifier.digest;
export const noirCommitmentScheme = rawBundle.commitmentScheme;

export const noirSamples: FarmSampleProof[] = rawBundle.samples.map((sample) => ({
  system: "noir",
  tier: sample.tier,
  label: sample.label,
  proof: sample.proof,
  publicInputs: sample.publicInputs,
  commitmentDigest: sample.commitmentDigest,
  proofDigest: sample.proofDigest,
  verifierDigest: sample.verifierDigest,
  expectedValid: sample.expectedValid,
}));
