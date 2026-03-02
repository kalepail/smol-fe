import type { DoorId, TierParity, VaultLaneCode } from "./policies";
import { getDoorDefinition, laneCodeForSeed, tierLabel, vaultLaneFromCode } from "./policies";
import type { VerifierType } from "./verifyCredential";

export type Mode = "normal" | "training";

export type ProvenInputs = {
  tierId: number;
};

export type LobbyState =
  | { enabled: false }
  | { enabled: true; waiting: boolean; reason?: string };

export type DoorOutcome = {
  accepted: boolean;
  reasonCode:
    | "ACCEPTED"
    | "PROOF_INVALID"
    | "WRONG_CREDENTIAL_FORMAT"
    | "POLICY_MISMATCH"
    | "LOBBY_WAITING_FOR_OTHER_PLAYER";
  reasonHuman: string;
  forensics: {
    policyName: string;
    policyRule: string;
    doorRequirement: string;
    yourCredentialSummary: string;
    mismatchExplanation: string;
    nextAction: string;
  };
  debug?: {
    tierId: number;
    parity: TierParity;
    lane: VaultLaneCode;
    comparisons: string[];
  };
};

function parityForTier(tierId: number): TierParity {
  return tierId % 2 === 0 ? "EVEN" : "ODD";
}

export function evaluateDoorAttempt(params: {
  floor: number;
  doorId: DoorId;
  policySeed: string;
  proofOk: boolean;
  provenInputs: ProvenInputs;
  lobbyState: LobbyState;
  mode: Mode;
  expectedVerifierType?: VerifierType;
  presentedVerifierType?: VerifierType;
}): DoorOutcome {
  const tierId = params.provenInputs.tierId;
  const parity = parityForTier(tierId);
  const lane = laneCodeForSeed(params.policySeed || "demo", params.floor);
  const laneMeta = vaultLaneFromCode(lane);
  const door = getDoorDefinition(params.floor, params.doorId, { seed: params.policySeed || "demo", tierId });

  const comparisons: string[] = [];

  if (!params.proofOk) {
    return {
      accepted: false,
      reasonCode: "PROOF_INVALID",
      reasonHuman: "Credential invalid: proof verification failed.",
      forensics: {
        policyName: door.policyName,
        policyRule: `${door.policyName} (${door.tags.map((t) => t.long).join(", ")})`,
        doorRequirement: door.tags.map((t) => t.long).join(" + "),
        yourCredentialSummary: `Tier ${tierLabel(tierId)} (${tierId}) • ${parity} • Lane ${laneMeta.name}`,
        mismatchExplanation: "The cryptographic verifier rejected the credential.",
        nextAction: "Regenerate the credential and retry the same door.",
      },
      debug:
        params.mode === "training"
          ? { tierId, parity, lane, comparisons: ["proofOk === false"] }
          : undefined,
    };
  }

  // Optional gate: some rooms require a specific credential format (proof system).
  // This is distinct from "proof invalid" and from policy mismatch.
  if (
    params.expectedVerifierType &&
    params.presentedVerifierType &&
    params.expectedVerifierType !== params.presentedVerifierType
  ) {
    const expected = params.expectedVerifierType;
    const presented = params.presentedVerifierType;
    return {
      accepted: false,
      reasonCode: "WRONG_CREDENTIAL_FORMAT",
      reasonHuman: "Credential valid, but the format is not accepted in this wing.",
      forensics: {
        policyName: "Format Gate",
        policyRule: `This wing expects ${expected}.`,
        doorRequirement: `Expected verifier: ${expected}`,
        yourCredentialSummary: `Tier ${tierLabel(tierId)} (${tierId}) • ${parity} • Lane ${laneMeta.name}`,
        mismatchExplanation: `You presented ${presented}, but this room's verifier only accepts ${expected}.`,
        nextAction: `Switch your credential presentation to ${expected} and retry.`,
      },
      debug:
        params.mode === "training"
          ? {
              tierId,
              parity,
              lane,
              comparisons: [`presentedVerifierType=${presented}`, `expectedVerifierType=${expected}`],
            }
          : undefined,
    };
  }

  if (params.lobbyState.enabled && params.lobbyState.waiting) {
    return {
      accepted: false,
      reasonCode: "LOBBY_WAITING_FOR_OTHER_PLAYER",
      reasonHuman: "Credential valid, but dual-control requires the other player to reach this gate.",
      forensics: {
        policyName: "Dual-Control Gate",
        policyRule: "Both auditors must be present at the gate",
        doorRequirement: params.lobbyState.reason || "Waiting for the other player",
        yourCredentialSummary: `Tier ${tierLabel(tierId)} (${tierId}) • ${parity} • Lane ${laneMeta.name}`,
        mismatchExplanation: "This is not a policy mismatch; it is a synchronization gate.",
        nextAction: "Wait for Player 2 to reach the same floor (or switch to Solo).",
      },
      debug:
        params.mode === "training"
          ? { tierId, parity, lane, comparisons: ["lobbyState.waiting === true"] }
          : undefined,
    };
  }

  // Policy evaluation (deterministic and explainable).
  let accepted = false;
  let rule = "";
  let mismatch = "";
  let next = "";

  if (door.policy.kind === "min-tier+lane") {
    const passTier = tierId >= door.policy.requiredTierMin;
    const passLane = lane === door.policy.requiredLane;
    comparisons.push(`${tierId} >= ${door.policy.requiredTierMin} => ${passTier}`);
    comparisons.push(`${laneMeta.name} === ${vaultLaneFromCode(door.policy.requiredLane).name} => ${passLane}`);
    accepted = passTier && passLane;
    rule = `Minimum Clearance ≥ ${tierLabel(door.policy.requiredTierMin)} (${door.policy.requiredTierMin}) AND Lane = ${vaultLaneFromCode(door.policy.requiredLane).name}`;
    mismatch = accepted
      ? ""
      : `Door requires (Tier ≥ ${door.policy.requiredTierMin}) and (Lane = ${vaultLaneFromCode(door.policy.requiredLane).name}). Your credential is Tier ${tierId} (${parity}) in Lane ${laneMeta.name}.`;
    next = accepted
      ? "Proceed to the next checkpoint."
      : "Choose a door whose MIN and LANE both match your credential.";
  } else if (door.policy.kind === "exact-tier+lane") {
    const passTier = tierId === door.policy.requiredTierExact;
    const passLane = lane === door.policy.requiredLane;
    comparisons.push(`${tierId} === ${door.policy.requiredTierExact} => ${passTier}`);
    comparisons.push(`${laneMeta.name} === ${vaultLaneFromCode(door.policy.requiredLane).name} => ${passLane}`);
    accepted = passTier && passLane;
    rule = `Role = ${tierLabel(door.policy.requiredTierExact)} (${door.policy.requiredTierExact}) AND Lane = ${vaultLaneFromCode(door.policy.requiredLane).name}`;
    mismatch = accepted
      ? ""
      : `Door requires (ROLE = ${door.policy.requiredTierExact}) and (Lane = ${vaultLaneFromCode(door.policy.requiredLane).name}). Your credential is Tier ${tierId} (${parity}) in Lane ${laneMeta.name}.`;
    next = accepted
      ? "Proceed to the next checkpoint."
      : "Choose a door whose ROLE and LANE both match your credential.";
  } else if (door.policy.kind === "min-tier+parity+lane") {
    const passTier = tierId >= door.policy.requiredTierMin;
    const passParity = parity === door.policy.requiredParity;
    const passLane = lane === door.policy.requiredLane;
    comparisons.push(`${tierId} >= ${door.policy.requiredTierMin} => ${passTier}`);
    comparisons.push(`${parity} === ${door.policy.requiredParity} => ${passParity}`);
    comparisons.push(`${laneMeta.name} === ${vaultLaneFromCode(door.policy.requiredLane).name} => ${passLane}`);
    accepted = passTier && passParity && passLane;
    rule = `Minimum Clearance ≥ ${tierLabel(door.policy.requiredTierMin)} (${door.policy.requiredTierMin}) AND Parity = ${door.policy.requiredParity} AND Lane = ${vaultLaneFromCode(door.policy.requiredLane).name}`;
    mismatch = accepted
      ? ""
      : `Door requires (Tier ≥ ${door.policy.requiredTierMin}), (Parity = ${door.policy.requiredParity}), and (Lane = ${vaultLaneFromCode(door.policy.requiredLane).name}). Your credential is Tier ${tierId} (${parity}) in Lane ${laneMeta.name}.`;
    next = accepted
      ? "Proceed to the next checkpoint."
      : "Choose a door whose MIN, PARITY, and LANE all match your credential.";
  } else {
    // Exhaustiveness guard
    const _never: never = door.policy;
    throw new Error(`Unsupported policy kind: ${String(_never)}`);
  }

  if (accepted) {
    return {
      accepted: true,
      reasonCode: "ACCEPTED",
      reasonHuman: "ACCESS GRANTED: credential satisfies this door policy.",
      forensics: {
        policyName: door.policyName,
        policyRule: rule,
        doorRequirement: door.tags.map((t) => t.long).join(" + "),
        yourCredentialSummary: `Tier ${tierLabel(tierId)} (${tierId}) • ${parity} • Lane ${laneMeta.name}`,
        mismatchExplanation: "None.",
        nextAction: "Proceed to the next floor.",
      },
      debug: params.mode === "training" ? { tierId, parity, lane, comparisons } : undefined,
    };
  }

  return {
    accepted: false,
    reasonCode: "POLICY_MISMATCH",
    reasonHuman: "ACCESS DENIED: credential is valid but does not satisfy this door policy.",
    forensics: {
      policyName: door.policyName,
      policyRule: rule,
      doorRequirement: door.tags.map((t) => t.long).join(" + "),
      yourCredentialSummary: `Tier ${tierLabel(tierId)} (${tierId}) • ${parity} • Lane ${laneMeta.name}`,
      mismatchExplanation: mismatch,
      nextAction: next,
    },
    debug: params.mode === "training" ? { tierId, parity, lane, comparisons } : undefined,
  };
}
