export type DoorId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DoorPolicyTag = {
  short: string; // Small label for the door card UI
  long: string;  // Used in forensic output
};

export type TierParity = "EVEN" | "ODD";

export type VaultLaneCode = 0 | 1 | 2 | 3;
export type VaultLaneName = "INDIGO" | "AMBER" | "MINT" | "ROSE";

export type VaultLane = {
  code: VaultLaneCode;
  name: VaultLaneName;
  color: string;
};

export type DoorPolicy =
  | {
      kind: "min-tier+lane";
      requiredTierMin: number;
      requiredLane: VaultLaneCode;
    }
  | {
      kind: "exact-tier+lane";
      requiredTierExact: number;
      requiredLane: VaultLaneCode;
    }
  | {
      kind: "min-tier+parity+lane";
      requiredTierMin: number;
      requiredParity: TierParity;
      requiredLane: VaultLaneCode;
    };

export type DoorDefinition = {
  id: DoorId;
  label: string;
  policyName: string;
  policy: DoorPolicy;
  tags: DoorPolicyTag[];
};

export type FloorDefinition = {
  floor: number;
  roomId: "intake" | "catalog" | "cold";
  policyName: string;
  briefing: string;
  verifierType: "GROTH16" | "NOIR_ULTRAHONK" | "RISC0_RECEIPT";
  doors: DoorDefinition[];
};

function parityForTier(tierId: number): TierParity {
  return tierId % 2 === 0 ? "EVEN" : "ODD";
}

export function tierLabel(tierId: number): string {
  // Keep short, readable labels (and avoid "0" being the obvious answer).
  switch (tierId) {
    case 0:
      return "SPROUT";
    case 1:
      return "GROWER";
    case 2:
      return "HARVEST";
    case 3:
      return "WHALE";
    default:
      return `TIER ${tierId}`;
  }
}

export function vaultLaneFromCode(code: VaultLaneCode): VaultLane {
  switch (code) {
    case 0:
      return { code, name: "INDIGO", color: "#4ad0ff" };
    case 1:
      return { code, name: "AMBER", color: "#ffc47a" };
    case 2:
      return { code, name: "MINT", color: "#7bffb0" };
    case 3:
      return { code, name: "ROSE", color: "#ff7bbd" };
  }
}

function fnv1a32(input: string): number {
  // Deterministic, fast hash for policy generation (no async crypto).
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function laneCodeForSeed(seed: string, floor: number): VaultLaneCode {
  const n = fnv1a32(`${seed}:lane:${floor}`) % 4;
  return n as VaultLaneCode;
}

function shuffledDoorIds(seed: string): DoorId[] {
  const prng = mulberry32(fnv1a32(seed));
  const ids: DoorId[] = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(prng() * (i + 1));
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  return ids;
}

function mkMinTierLaneDoor(
  id: DoorId,
  requiredTierMin: number,
  requiredLane: VaultLaneCode,
): DoorDefinition {
  const lane = vaultLaneFromCode(requiredLane);
  return {
    id,
    label: `DOOR ${id + 1}`,
    policyName: "Intake Routing",
    policy: { kind: "min-tier+lane", requiredTierMin, requiredLane },
    tags: [
      {
        short: `MIN ≥ T${requiredTierMin}`,
        long: `Minimum Clearance ≥ ${tierLabel(requiredTierMin)} (${requiredTierMin})`,
      },
      { short: `LANE: ${lane.name}`, long: `Routing Lane = ${lane.name}` },
    ],
  };
}

function mkExactTierLaneDoor(
  id: DoorId,
  requiredTierExact: number,
  requiredLane: VaultLaneCode,
): DoorDefinition {
  const lane = vaultLaneFromCode(requiredLane);
  return {
    id,
    label: `DOOR ${id + 1}`,
    policyName: "Role-Based Access",
    policy: { kind: "exact-tier+lane", requiredTierExact, requiredLane },
    tags: [
      {
        short: `ROLE = T${requiredTierExact}`,
        long: `Role = ${tierLabel(requiredTierExact)} (${requiredTierExact})`,
      },
      { short: `LANE: ${lane.name}`, long: `Custody Lane = ${lane.name}` },
    ],
  };
}

function mkMinTierParityLaneDoor(
  id: DoorId,
  requiredTierMin: number,
  requiredParity: TierParity,
  requiredLane: VaultLaneCode,
): DoorDefinition {
  const lane = vaultLaneFromCode(requiredLane);
  return {
    id,
    label: `DOOR ${id + 1}`,
    policyName: "Two-Factor Policy",
    policy: { kind: "min-tier+parity+lane", requiredTierMin, requiredParity, requiredLane },
    tags: [
      {
        short: `MIN ≥ T${requiredTierMin}`,
        long: `Minimum Clearance ≥ ${tierLabel(requiredTierMin)} (${requiredTierMin})`,
      },
      { short: `PARITY: ${requiredParity}`, long: `Parity = ${requiredParity}` },
      { short: `LANE: ${lane.name}`, long: `Cold-Chain Lane = ${lane.name}` },
    ],
  };
}

export function getFloorDefinition(
  floor: number,
  ctx: { seed: string; tierId: number },
): FloorDefinition {
  const lane = laneCodeForSeed(ctx.seed || "demo", floor);
  const tierId = Math.max(0, Math.min(3, Math.trunc(ctx.tierId)));
  const tierParity = parityForTier(tierId);
  const prng = mulberry32(fnv1a32(`${ctx.seed}:floor:${floor}`));

  const ids = shuffledDoorIds(`${ctx.seed}:doors:${floor}`);
  const correctDoor = ids[0]!;
  const decoy1 = ids[1]!;
  const decoy2 = ids[2]!;
  const wrong1 = ids[3]!;
  const wrong2 = ids[4]!;
  const wrong3 = ids[5]!;
  const wrong4 = ids[6]!;
  const wrong5 = ids[7]!;
  const otherLanes: VaultLaneCode[] = ([0, 1, 2, 3].filter((c) => c !== lane) as VaultLaneCode[]);
  const wrongLane1 = otherLanes[0] ?? ((lane + 1) % 4 as VaultLaneCode);
  const wrongLane2 = otherLanes[1] ?? ((lane + 2) % 4 as VaultLaneCode);
  const wrongLane3 = otherLanes[2] ?? ((lane + 3) % 4 as VaultLaneCode);

  const doorsById = new Map<DoorId, DoorDefinition>();
  const allDoorIds: DoorId[] = [0, 1, 2, 3, 4, 5, 6, 7];

  if (floor === 1) {
    // Intake: clearance bar is low, but routing lanes prevent cross-contamination.
    // Correct door: lane match + min <= tier (always satisfiable).
    // Decoys/wrongs: partial matches so the player must read both tags.
    const minOk = Math.max(0, tierId - (prng() > 0.6 ? 1 : 0));
    const minTooHigh = Math.min(3, tierId + 1);
    const minWayTooHigh = Math.min(3, tierId + 2);

    doorsById.set(correctDoor, mkMinTierLaneDoor(correctDoor, minOk, lane));
    // Lane matches but tier requirement fails.
    doorsById.set(decoy1, mkMinTierLaneDoor(decoy1, minTooHigh, lane));
    doorsById.set(decoy2, mkMinTierLaneDoor(decoy2, minWayTooHigh, lane));
    // Tier requirement can pass, but lane is wrong.
    doorsById.set(wrong1, mkMinTierLaneDoor(wrong1, minOk, wrongLane1));
    doorsById.set(wrong2, mkMinTierLaneDoor(wrong2, minOk, wrongLane2));
    doorsById.set(wrong3, mkMinTierLaneDoor(wrong3, minOk, wrongLane3));
    // Both wrong (keeps the grid non-trivial).
    doorsById.set(wrong4, mkMinTierLaneDoor(wrong4, minTooHigh, wrongLane1));
    doorsById.set(wrong5, mkMinTierLaneDoor(wrong5, minTooHigh, wrongLane2));

    return {
      floor,
      roomId: "intake",
      policyName: "Intake Routing",
      briefing:
        "Intake uses two constraints: a minimum clearance plus a routing lane. Read both tags; a valid credential can still be denied by lane mismatch.",
      verifierType: "GROTH16",
      doors: allDoorIds.map((id) => doorsById.get(id)!) as DoorDefinition[],
    };
  }

  if (floor === 2) {
    // Catalog: exact role + lane.
    // Correct: exact tier + lane. Decoys/wrongs are partial matches.
    const wrongTier = (tierId + 1) % 4;
    const wrongTier2 = (tierId + 2) % 4;
    const wrongTier3 = (tierId + 3) % 4;
    doorsById.set(correctDoor, mkExactTierLaneDoor(correctDoor, tierId, lane));
    // Lane match but wrong role.
    doorsById.set(decoy1, mkExactTierLaneDoor(decoy1, wrongTier, lane));
    doorsById.set(decoy2, mkExactTierLaneDoor(decoy2, wrongTier2, lane));
    // Role match but wrong lane.
    doorsById.set(wrong1, mkExactTierLaneDoor(wrong1, tierId, wrongLane1));
    doorsById.set(wrong2, mkExactTierLaneDoor(wrong2, tierId, wrongLane2));
    doorsById.set(wrong3, mkExactTierLaneDoor(wrong3, tierId, wrongLane3));
    // Both wrong.
    doorsById.set(wrong4, mkExactTierLaneDoor(wrong4, wrongTier3, wrongLane1));
    doorsById.set(wrong5, mkExactTierLaneDoor(wrong5, wrongTier2, wrongLane2));

    return {
      floor,
      roomId: "catalog",
      policyName: "Role-Based Access",
      briefing:
        "Custody is strict: exact role plus custody lane. Read both tags; “close enough” does not open drawers.",
      verifierType: "NOIR_ULTRAHONK",
      doors: allDoorIds.map((id) => doorsById.get(id)!) as DoorDefinition[],
    };
  }

  if (floor === 3) {
    // Cold storage: multi-constraint (min + parity + lane).
    // Correct: tier ok + parity ok + lane ok. Decoys/wrongs are partial matches.
    const minOk = Math.max(0, tierId - (prng() > 0.5 ? 1 : 0));
    const minTooHigh = Math.min(3, tierId + 1);
    const minWayTooHigh = Math.min(3, tierId + 2);
    const flippedParity: TierParity = tierParity === "EVEN" ? "ODD" : "EVEN";

    doorsById.set(correctDoor, mkMinTierParityLaneDoor(correctDoor, minOk, tierParity, lane));
    // Lane match but parity wrong.
    doorsById.set(decoy1, mkMinTierParityLaneDoor(decoy1, minOk, flippedParity, lane));
    // Lane match but min too high (even with correct parity).
    doorsById.set(decoy2, mkMinTierParityLaneDoor(decoy2, minTooHigh, tierParity, lane));
    // Parity match but lane wrong.
    doorsById.set(wrong1, mkMinTierParityLaneDoor(wrong1, minOk, tierParity, wrongLane1));
    doorsById.set(wrong2, mkMinTierParityLaneDoor(wrong2, minOk, tierParity, wrongLane2));
    doorsById.set(wrong3, mkMinTierParityLaneDoor(wrong3, minOk, tierParity, wrongLane3));
    // Mixed wrongs.
    doorsById.set(wrong4, mkMinTierParityLaneDoor(wrong4, minWayTooHigh, flippedParity, wrongLane1));
    doorsById.set(wrong5, mkMinTierParityLaneDoor(wrong5, minTooHigh, flippedParity, wrongLane2));

    return {
      floor,
      roomId: "cold",
      policyName: "Two-Factor Policy",
      briefing:
        "Incident response added two-factor: minimum clearance + parity + cold-chain lane. A credential can be valid and still fail policy.",
      verifierType: "RISC0_RECEIPT",
      doors: allDoorIds.map((id) => doorsById.get(id)!) as DoorDefinition[],
    };
  }

  throw new Error(`Unsupported floor=${floor}`);
}

export function getDoorDefinition(
  floor: number,
  doorId: DoorId,
  ctx: { seed: string; tierId: number },
): DoorDefinition {
  const def = getFloorDefinition(floor, ctx);
  const door = def.doors.find((d) => d.id === doorId);
  if (!door) {
    throw new Error(`Unknown doorId=${doorId} for floor=${floor}`);
  }
  return door;
}
