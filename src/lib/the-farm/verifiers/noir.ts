import { UltraHonkBackend } from "@aztec/bb.js";
import type { ProofData } from "@aztec/bb.js";
import type { VerificationResult } from "../types";

type NoirProofPayload = {
  proofBase64: string;
  publicInputs: string[];
};

let backend: UltraHonkBackend | null = null;
let backendBytecode = "";

function decodeBase64(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function getBackend(bytecodeGzipBase64: string): Promise<UltraHonkBackend> {
  if (!backend || backendBytecode !== bytecodeGzipBase64) {
    if (backend) {
      await backend.destroy();
    }

    // bb.js accepts Noir's base64(gzip(acir)) bytecode directly.
    backend = new UltraHonkBackend(bytecodeGzipBase64, { threads: 1 });
    backendBytecode = bytecodeGzipBase64;

    if (import.meta.env.DEV) {
      console.debug("[Noir] UltraHonkBackend ready");
    }
  }

  return backend;
}

export function preloadNoirVerifier(bytecode: string): void {
  void getBackend(bytecode).catch(() => {
    // Preload failure is non-fatal; verify() will surface the error.
  });
}

export async function verifyNoirProof(
  bytecode: string,
  proof: unknown,
): Promise<VerificationResult> {
  const payload = proof as Partial<NoirProofPayload> | null;
  if (
    !payload?.proofBase64 ||
    !Array.isArray(payload.publicInputs) ||
    !payload.publicInputs.every((input) => typeof input === "string")
  ) {
    return {
      valid: false,
      durationMs: 0,
      error: "Malformed Noir proof payload",
    };
  }

  const startedAt = performance.now();

  try {
    const verifier = await getBackend(bytecode);

    const proofData: ProofData = {
      proof: decodeBase64(payload.proofBase64),
      publicInputs: payload.publicInputs,
    };

    const valid = await verifier.verifyProof(proofData);

    if (import.meta.env.DEV) {
      console.debug(`[Noir] verifyProof ${valid ? "PASS" : "FAIL"}`);
    }

    return {
      valid,
      durationMs: Math.round(performance.now() - startedAt),
      error: valid ? undefined : "Noir verification returned false",
    };
  } catch (error) {
    return {
      valid: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Noir verification failed",
    };
  }
}
