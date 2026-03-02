export type ProofSystem = "circom" | "noir" | "risc0";

export type Tier = "sprout" | "grower" | "harvester" | "whale" | "edge" | "invalid";

export interface VerificationResult {
  valid: boolean;
  durationMs: number;
  error?: string;
}

export interface AttestationResult {
  ok: boolean;
  txHash?: string;
  ledger?: number;
  timestamp?: number;
  feeCharged?: string;
  error?: string;
}

export interface FarmSampleProof {
  system: ProofSystem;
  tier: Tier;
  label: string;
  proof: unknown;
  publicInputs: unknown;
  commitmentDigest: string;
  proofDigest: string;
  verifierDigest: string;
  expectedValid: boolean;
}
