import { groth16 } from "snarkjs";
import type { VerificationResult } from "../types";

export async function verifyCircomGroth16(
  vk: unknown,
  proof: unknown,
  publicSignals: unknown,
): Promise<VerificationResult> {
  const startedAt = performance.now();

  try {
    const valid = await groth16.verify(vk as any, publicSignals as any, proof as any);
    const durationMs = Math.round(performance.now() - startedAt);
    return {
      valid,
      durationMs,
      error: valid ? undefined : "Groth16 verification returned false",
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    const message = error instanceof Error ? error.message : "Groth16 verification failed";
    return {
      valid: false,
      durationMs,
      error: message,
    };
  }
}
