import type { Smol } from "../../types/domain";
import {
  getSnapshotAsync,
  mergeSmolsWithSnapshot,
} from "./snapshot";

const API_URL = import.meta.env.PUBLIC_API_URL || 'https://api.smol.xyz';

/**
 * Fetch all smols with Hybrid Strategy (Live + GalacticSnapshot Merge)
 */
export async function fetchSmols(options?: { limit?: number; signal?: AbortSignal }): Promise<Smol[]> {
  try {
    const url = new URL(`${API_URL}`);
    // Default to 5000 if no limit specified to ensure all songs load
    const limit = options?.limit ?? 5000;
    url.searchParams.set("limit", String(limit));

    // 1. Parallelize Live Fetch and Snapshot Load
    const [liveRes, snapshot] = await Promise.all([
      fetch(url.toString(), { signal: options?.signal }),
      getSnapshotAsync(),
    ]);

    if (!liveRes.ok) {
      console.warn(
        `Failed to fetch live smols: ${liveRes.statusText}, falling back to snapshot`,
      );
      return snapshot;
    }

    const data = await liveRes.json();
    const liveSmols = (data.smols || data) as Smol[];
    if (!Array.isArray(liveSmols) || liveSmols.length === 0) {
      console.warn("Live smols response empty, falling back to snapshot");
      return snapshot;
    }

    // 2. Perform Merging with pre-loaded snapshot
    const snapshotMap = new Map(snapshot.map((s) => [s.Id, s]));

    // Merge: Prefer Live, but fallback to Snapshot for missing critical fields
    const merged = liveSmols.map((newSmol) => {
      const oldSmol = snapshotMap.get(newSmol.Id);
      return {
        ...newSmol,
        Tags:
          newSmol.Tags && newSmol.Tags.length > 0
            ? newSmol.Tags
            : oldSmol?.Tags || [],
        Address: newSmol.Address || oldSmol?.Address || undefined,
        Minted_By: newSmol.Minted_By || oldSmol?.Minted_By || undefined,
        Username: newSmol.Username || oldSmol?.Username || undefined,
      };
    });

    // 3. Add songs from snapshot that aren't in the live response
    const liveIds = new Set(liveSmols.map((s) => s.Id));
    snapshot.forEach((oldSmol) => {
      if (!liveIds.has(oldSmol.Id)) {
        merged.push({
          ...oldSmol,
          Tags: oldSmol.Tags || [],
          Address: oldSmol.Address || undefined,
          Minted_By: oldSmol.Minted_By || undefined,
          Username: oldSmol.Username || undefined,
        });
      }
    });

    // 4. DEEP VERIFICATION: Hydrate missing metadata for "Live-Only" songs
    // (Songs present in API but not in snapshot = New drops missing tags/address)
    const newItems = merged.filter(
      (s: any) =>
        !snapshotMap.has(s.Id) &&
        (!s.Tags || s.Tags.length === 0 || !s.Address),
    );

    if (newItems.length > 0) {
      // console.log(`[HybridData] Found ${newItems.length} new live items. Hydrating tags...`);
      // Fetch details in parallel chunks (Batched to prevent rate limits)
      const chunkSize = 5;
      for (let i = 0; i < newItems.length; i += chunkSize) {
        const chunk = newItems.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (song: any) => {
            try {
              const res = await fetch(`${API_URL}/${song.Id}`, { signal: options?.signal });
              if (!res.ok) return;
              const data = await res.json();
              const detail = data.d1 || data.kv_do;
              if (detail) {
                if (detail.Tags) song.Tags = detail.Tags;
                if (detail.lyrics?.style) {
                  song.Tags = [...(song.Tags || []), ...detail.lyrics.style];
                }
                if (detail.Address) song.Address = detail.Address;
                // Prefer Username if available, otherwise fallback to Creator/Address logic downstream
                if (detail.Username) song.Username = detail.Username;
                if (detail.Creator) song.Creator = detail.Creator;
                if (detail.Mint_Token) song.Mint_Token = detail.Mint_Token;
              }
            } catch (e) {
              // console.warn(`Failed to hydrate ${song.Id}`, e);
            }
          }),
        );
      }
    }

    return merged as Smol[];
  } catch (e) {
    console.error("Fetch error, falling back to snapshot", e);
    return getSnapshotAsync();
  }
}

/**
 * Get the full snapshot directly (for components needing all tags, like RadioBuilder)
 */
export async function getFullSnapshot(): Promise<Smol[]> {
  return getSnapshotAsync();
}

/**
 * Safe fetch wrapper that guarantees a non-empty snapshot fallback.
 */
export async function safeFetchSmols(
  options?: { limit?: number; signal?: AbortSignal },
): Promise<Smol[]> {
  const smols = await fetchSmols(options);
  if (!Array.isArray(smols) || smols.length === 0) {
    return getSnapshotAsync();
  }
  return smols;
}

/**
 * Fetch liked smol IDs for the current user
 */
export async function fetchLikedSmols(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(`${API_URL}/likes`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    return [];
  }
  return response.json();
}

/**
 * Like a smol
 */
export async function likeSmol(smolId: string): Promise<void> {
  const response = await fetch(`${API_URL}/like`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ smol_id: smolId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to like smol: ${response.statusText}`);
  }
}

/**
 * Unlike a smol
 */
export async function unlikeSmol(smolId: string): Promise<void> {
  const response = await fetch(`${API_URL}/unlike`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ smol_id: smolId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to unlike smol: ${response.statusText}`);
  }
}
