const envRisc0Groth16VerifierMainnet = import.meta.env.PUBLIC_RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET;

export const RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET =
  typeof envRisc0Groth16VerifierMainnet === "string" && envRisc0Groth16VerifierMainnet.trim().length > 0
    ? envRisc0Groth16VerifierMainnet.trim()
    : "";

// ── Testnet (hackathon mode) ────────────────────────────────────────────────

const envRisc0Groth16VerifierTestnet = import.meta.env.PUBLIC_RISC0_GROTH16_VERIFIER_CONTRACT_ID_TESTNET;

export const RISC0_GROTH16_VERIFIER_CONTRACT_ID_TESTNET =
  typeof envRisc0Groth16VerifierTestnet === "string" && envRisc0Groth16VerifierTestnet.trim().length > 0
    ? envRisc0Groth16VerifierTestnet.trim()
    : "";

