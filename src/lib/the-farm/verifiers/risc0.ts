import type { VerificationResult } from "../types";
import initVerifier, {
  verify_receipt_json,
} from "../../../../zk/risc0-tier/verifier-wasm/pkg/risc0_receipt_verifier_wasm.js";

type Risc0ProofPayload = {
  receiptJson: string;
};

let initPromise: Promise<unknown> | null = null;

async function ensureVerifierReady(): Promise<void> {
  if (!initPromise) {
    initPromise = initVerifier();
  }
  await initPromise;
}

export function preloadRisc0Verifier(): void {
  void ensureVerifierReady().catch(() => {
    // Verification path returns the failure detail.
  });
}

export async function verifyRisc0Receipt(
  methodIdHex: string,
  proof: unknown,
): Promise<VerificationResult> {
  const payload = proof as Partial<Risc0ProofPayload> | null;
  if (!payload?.receiptJson) {
    return {
      valid: false,
      durationMs: 0,
      error: "Malformed RISC0 receipt payload",
    };
  }

  const startedAt = performance.now();

  try {
    await ensureVerifierReady();
    const valid = verify_receipt_json(methodIdHex, payload.receiptJson);
    return {
      valid,
      durationMs: Math.round(performance.now() - startedAt),
      error: valid ? undefined : "RISC0 receipt verification returned false",
    };
  } catch (error) {
    return {
      valid: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "RISC0 receipt verification failed",
    };
  }
}
