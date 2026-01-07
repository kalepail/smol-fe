import type { Smol } from "../../types/domain";

// OOM FIX: Removed static JSON imports - data fetched at runtime
let cachedSnapshot: Smol[] | null = null;

/**
 * Fetch snapshot at runtime instead of bundling at build time
 */
export async function getSnapshotAsync(): Promise<Smol[]> {
  if (cachedSnapshot) return cachedSnapshot;

  try {
    const res = await fetch('/data/GalacticSnapshot.json');
    if (!res.ok) throw new Error(`Snapshot load failed: ${res.status}`);
    const data = await res.json();

    // Support both legacy array and new structured object { songs: [], tagGraph: {} }
    const songs = Array.isArray(data) ? data : (data.songs || []);
    cachedSnapshot = songs;
    return cachedSnapshot;
  } catch (e) {
    console.error('[getSnapshotAsync] Failed to load snapshot:', e);
    return [];
  }
}

/**
 * Fetch the tag graph (Matrix) from the snapshot
 */
export async function getSnapshotTagGraphAsync(): Promise<any | null> {
  try {
    const res = await fetch('/data/GalacticSnapshot.json');
    if (!res.ok) return null;
    const data = await res.json();
    return data.tagGraph || null;
  } catch (e) {
    return null;
  }
}

/**
 * Synchronous version for SSR compatibility - returns cached data or empty array
 * Components should use getSnapshotAsync() in onMount for full data
 */
export function getGlobalSnapshot(): Smol[] {
  // Return cached if available, otherwise empty (data will be fetched client-side)
  return cachedSnapshot || [];
}

export async function mergeSmolsWithSnapshot(liveSmols: Smol[]): Promise<Smol[]> {
  const snapshot = await getSnapshotAsync();
  const snapshotMap = new Map(snapshot.map((s) => [s.Id, s]));

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
  snapshot.forEach((oldSmol) => {
    if (!liveIds.has(oldSmol.Id)) {
      merged.push(oldSmol);
    }
  });

  return merged;
}
