import bundleJson from "../../../zk/circom-tier/artifacts/bundle.json";
import type { FarmSampleProof, Tier } from "../../lib/the-farm/types";

type CircomRawSample = {
  proof: unknown;
  publicSignals: string[];
};

type CircomRawBundle = {
  verificationKey: unknown;
  samples: Record<Tier, CircomRawSample>;
};

const rawBundle = bundleJson as CircomRawBundle;

const tierOrder: Tier[] = ["sprout", "grower", "harvester", "whale", "edge", "invalid"];

const tierLabel: Record<Tier, string> = {
  sprout: "Sprout Threshold",
  grower: "Grower Threshold",
  harvester: "Harvester Threshold",
  whale: "Whale Threshold",
  edge: "Edge Threshold",
  invalid: "Invalid (Tampered)",
};

const proofDigestByTier: Record<Tier, string> = {
  sprout: "094a421feed1786588bdb3b0fbff189c5cb8f1b718dfcc116297db1c6a4ecce2",
  grower: "a0bb25d7db89c6edc9b07a57f8b4888351127f7514603ea4b47c06c2dbfac7a7",
  harvester: "a616451658f7582295a36e595ed731805db6234a3c1350b71de7c2696ba4612d",
  whale: "d3c687e2def7946a4915b8b9da42ec5a6deee36b75a2902c792395c37b8d442a",
  edge: "14d4b414743c2be7c6bc9aa836df0bbb0990669f503ba86a6e52dc07ea66f6a1",
  invalid: "a740e618be095db2b415d5c95f1d9bc2c62a57e33be90e45a9899ed92dbf1de3",
};

export const circomVerificationKey = rawBundle.verificationKey;

const circomVerifierDigest = "648f5665a310fc60b9dd2e1040dacfd696dd729d0c6bfd64a27450d5cde1e6f9";

export const circomSamples: FarmSampleProof[] = tierOrder.map((tier) => {
  const sample = rawBundle.samples[tier];
  return {
    system: "circom",
    tier,
    label: tierLabel[tier],
    proof: sample.proof,
    publicInputs: sample.publicSignals,
    commitmentDigest: sample.publicSignals[1] ?? "",
    proofDigest: proofDigestByTier[tier],
    verifierDigest: circomVerifierDigest,
    expectedValid: tier !== "invalid",
  };
});
