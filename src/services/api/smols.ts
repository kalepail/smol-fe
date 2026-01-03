import type { Smol } from "../../types/domain";
import {
  getGlobalSnapshot,
  mergeSmolsWithSnapshot,
} from "./snapshot";

const API_URL = import.meta.env.PUBLIC_API_URL;

/**
 * Fetch all smols with Hybrid Strategy (Live + Snapshot Merge)
 */
export async function fetchSmols(options?: { limit?: number }): Promise<Smol[]> {
  try {
    const url = new URL(`${API_URL}`);
    if (options?.limit) {
      url.searchParams.set("limit", String(options.limit));
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn(
        `Failed to fetch live smols: ${response.statusText}, falling back to snapshot`,
      );
      return getGlobalSnapshot();
    }

    const data = await response.json();
    const liveSmols = data.smols || data;
    if (!Array.isArray(liveSmols) || liveSmols.length === 0) {
      console.warn("Live smols response empty, falling back to snapshot");
      return getGlobalSnapshot();
    }

    // Merge: Prefer Live, but fallback to Snapshot for missing critical fields (Tags, Address)
    const merged = mergeSmolsWithSnapshot(liveSmols as Smol[]);
    const snapshotMap = new Map(getGlobalSnapshot().map((s) => [s.Id, s]));

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
              const res = await fetch(`${API_URL}/${song.Id}`);
              if (!res.ok) return;
              const data = await res.json();
              const detail = data.d1 || data.kv_do;
              if (detail) {
                if (detail.Tags) song.Tags = detail.Tags;
                if (detail.lyrics?.style) {
                  song.Tags = [...(song.Tags || []), ...detail.lyrics.style];
                }
                if (detail.Address) song.Address = detail.Address;
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
    return getGlobalSnapshot();
  }
}

/**
 * Get the full snapshot directly (for components needing all tags, like RadioBuilder)
 */
export function getFullSnapshot(): Smol[] {
  return getGlobalSnapshot();
}

/**
 * Safe fetch wrapper that guarantees a non-empty snapshot fallback.
 */
export async function safeFetchSmols(
  options?: { limit?: number },
): Promise<Smol[]> {
  const smols = await fetchSmols(options);
  if (!Array.isArray(smols) || smols.length === 0) {
    return getGlobalSnapshot();
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
