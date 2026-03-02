import { noirSamples, noirVerifierBytecode } from "../../data/the-farm/noirBundle";
import { risc0MethodIdHex, risc0Samples } from "../../data/the-farm/risc0Bundle";
import { verifyNoirProof } from "../the-farm/verifiers/noir";
import { verifyRisc0Receipt } from "../the-farm/verifiers/risc0";

export type VerifierType = "GROTH16" | "NOIR_ULTRAHONK" | "RISC0_RECEIPT";

export type VerifiedCredential = {
  ok: boolean;
  verifierType: VerifierType;
  tierId: number;
  // For integrity UI, we expose whether the artifact is "training-only" (not bound to wallet inputs).
  trainingOnly: boolean;
  durationMs: number;
  error?: string;
  meta?: Record<string, unknown>;
};

function tierIdToFarmTier(tierId: number): "sprout" | "grower" | "harvester" | "whale" {
  if (tierId <= 0) return "sprout";
  if (tierId === 1) return "grower";
  if (tierId === 2) return "harvester";
  return "whale";
}

export async function verifyCredential(params: {
  verifierType: VerifierType;
  /**
   * Desired tier_id (0..3). For Noir/RISC0, the dungeon uses a verified training credential
   * selected by tier to keep the experience deterministic and solvable without faking proofs.
   */
  tierId: number;
}): Promise<VerifiedCredential> {
  const startedAt = performance.now();
  const tierId = Number.isFinite(params.tierId) ? params.tierId : 0;

  if (params.verifierType === "NOIR_ULTRAHONK") {
    const tier = tierIdToFarmTier(tierId);
    const sample = noirSamples.find((s) => s.tier === tier && s.expectedValid) ?? noirSamples.find((s) => s.expectedValid);
    if (!sample) {
      return {
        ok: false,
        verifierType: "NOIR_ULTRAHONK",
        tierId,
        trainingOnly: true,
        durationMs: 0,
        error: "No Noir sample proof available",
      };
    }

    const result = await verifyNoirProof(noirVerifierBytecode, sample.proof);
    return {
      ok: result.valid,
      verifierType: "NOIR_ULTRAHONK",
      tierId,
      trainingOnly: true,
      durationMs: Math.round(performance.now() - startedAt),
      error: result.valid ? undefined : result.error || "Noir verification failed",
      meta: { sampleLabel: sample.label, sampleTier: sample.tier },
    };
  }

  if (params.verifierType === "RISC0_RECEIPT") {
    const tier = tierIdToFarmTier(tierId);
    const sample = risc0Samples.find((s) => s.tier === tier && s.expectedValid) ?? risc0Samples.find((s) => s.expectedValid);
    if (!sample) {
      return {
        ok: false,
        verifierType: "RISC0_RECEIPT",
        tierId,
        trainingOnly: true,
        durationMs: 0,
        error: "No RISC0 sample receipt available",
      };
    }

    const result = await verifyRisc0Receipt(risc0MethodIdHex, sample.proof);
    return {
      ok: result.valid,
      verifierType: "RISC0_RECEIPT",
      tierId,
      trainingOnly: true,
      durationMs: Math.round(performance.now() - startedAt),
      error: result.valid ? undefined : result.error || "RISC0 receipt verification failed",
      meta: { sampleLabel: sample.label, sampleTier: sample.tier, methodIdHex: risc0MethodIdHex },
    };
  }

  // GROTH16: handled by the dungeon proof worker (real per-attempt proving).
  return {
    ok: true,
    verifierType: "GROTH16",
    tierId,
    trainingOnly: false,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
