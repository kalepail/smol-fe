import type { Smol } from "../../types/domain";
// @ts-ignore
import universalSnapshot from "../../../universal-smols.json";
import legacySnapshot from "../../data/smols-snapshot.json";

const globalSnapshot =
  (universalSnapshot as unknown as Smol[])?.length > 0
    ? (universalSnapshot as unknown as Smol[])
    : (legacySnapshot as unknown as Smol[]);

export function getGlobalSnapshot(): Smol[] {
  return globalSnapshot;
}

export function mergeSmolsWithSnapshot(liveSmols: Smol[]): Smol[] {
  const snapshotMap = new Map(globalSnapshot.map((s) => [s.Id, s]));

  const merged = liveSmols.map((newSmol) => {
    const oldSmol = snapshotMap.get(newSmol.Id);
    return {
      ...newSmol,
      Tags:
        newSmol.Tags && newSmol.Tags.length > 0
          ? newSmol.Tags
          : oldSmol?.Tags || [],
      Address: newSmol.Address || oldSmol?.Address || null,
      Minted_By: newSmol.Minted_By || oldSmol?.Minted_By || null,
    };
  });

  const liveIds = new Set(liveSmols.map((s) => s.Id));
  globalSnapshot.forEach((oldSmol) => {
    if (!liveIds.has(oldSmol.Id)) {
      merged.push(oldSmol);
    }
  });

  return merged;
}
