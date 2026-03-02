import bundleJson from "./noir_ultrahonk_role_legacy_bundle.json";

type NoirLegacyBundle = {
  system: "noir";
  commitmentScheme: string;
  verifier: {
    backend: "ultrahonk";
    vkBase64: string;
    vkDigest: string; // sha256 hex (no 0x)
    oracleHash: "keccak";
    bbVersion: string;
  };
  samples: Array<{
    expectedValid: boolean;
    proof: { proofBase64: string; publicInputs: string[] };
    publicInputs: string[];
    commitmentDigest: string;
  }>;
};

export const noirUltraHonkRoleLegacyBundle = bundleJson as NoirLegacyBundle;
export const noirUltraHonkRoleLegacyVkDigestHex = `0x${noirUltraHonkRoleLegacyBundle.verifier.vkDigest}`;

