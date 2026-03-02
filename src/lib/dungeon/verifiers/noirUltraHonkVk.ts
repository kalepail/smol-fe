// UltraHonk verifier for "VK + proof" (no ACIR bytecode required).
//
// Used by ZK Dungeon Room 2 (Catalog Hall) where the proof format is the
// on-chain compatible UltraHonk proof bytes verified against a registered VK.

type VerifyResult = {
  valid: boolean;
  durationMs: number;
  error?: string;
};

let cachedVerifier: any | null = null;
let cachedVkBase64 = "";
let cachedVkBytes: Uint8Array | null = null;

function decodeBase64(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export async function verifyUltraHonkProofWithVk(params: {
  vkBase64: string;
  proofBase64: string;
  publicInputs: string[];
  oracleHash?: "keccak" | "poseidon2" | "starknet";
}): Promise<VerifyResult> {
  const startedAt = performance.now();

  try {
    const vkBase64 = (params.vkBase64 || "").trim();
    if (!vkBase64) {
      return { valid: false, durationMs: 0, error: "Missing UltraHonk verification key" };
    }
    if (!params.proofBase64) {
      return { valid: false, durationMs: 0, error: "Missing UltraHonk proof bytes" };
    }
    if (!Array.isArray(params.publicInputs) || params.publicInputs.length === 0) {
      return { valid: false, durationMs: 0, error: "Missing UltraHonk public inputs" };
    }

    if (!cachedVerifier) {
      const mod = await import("@aztec/bb.js");
      cachedVerifier = new mod.UltraHonkVerifierBackend({ threads: 1 });
    }

    if (cachedVkBase64 !== vkBase64 || !cachedVkBytes) {
      cachedVkBase64 = vkBase64;
      cachedVkBytes = decodeBase64(vkBase64);
    }

    const proofBytes = decodeBase64(params.proofBase64);
    const options =
      params.oracleHash === "keccak" ? { keccak: true } : params.oracleHash === "starknet" ? { starknet: true } : {};

    const ok = await cachedVerifier.verifyProof(
      { proof: proofBytes, publicInputs: params.publicInputs, verificationKey: cachedVkBytes },
      options as any,
    );

    return {
      valid: !!ok,
      durationMs: Math.round(performance.now() - startedAt),
      error: ok ? undefined : "UltraHonk VK verification returned false",
    };
  } catch (e) {
    return {
      valid: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: e instanceof Error ? e.message : "UltraHonk VK verification failed",
    };
  }
}

