import bundleJson from "./risc0.bundle.json";
import type { FarmSampleProof, Tier } from "../../lib/the-farm/types";

type Risc0ProofPayload = {
  receiptJson: string;
};

type Risc0RawSample = {
  system: "risc0";
  tier: Tier;
  label: string;
  proof: Risc0ProofPayload;
  publicInputs: {
    tier: string;
    threshold: number;
    commitmentDigest: string;
  };
  commitmentDigest: string;
  proofDigest: string;
  verifierDigest: string;
  expectedValid: boolean;
};

type Risc0RawBundle = {
  system: "risc0";
  commitmentScheme: string;
  verifier: {
    methodIdHex: string;
    digest: string;
  };
  samples: Risc0RawSample[];
};

const rawBundle = bundleJson as Risc0RawBundle;

export const risc0MethodIdHex = rawBundle.verifier.methodIdHex;
export const risc0VerifierDigest = rawBundle.verifier.digest;
export const risc0CommitmentScheme = rawBundle.commitmentScheme;

export const risc0Samples: FarmSampleProof[] = rawBundle.samples.map((sample) => ({
  system: "risc0",
  tier: sample.tier,
  label: sample.label,
  proof: sample.proof,
  publicInputs: sample.publicInputs,
  commitmentDigest: sample.commitmentDigest,
  proofDigest: sample.proofDigest,
  verifierDigest: sample.verifierDigest,
  expectedValid: sample.expectedValid,
}));
