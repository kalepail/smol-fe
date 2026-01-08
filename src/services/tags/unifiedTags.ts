import type { Smol } from "../../types/domain";
import { getSnapshotAsync } from "../api/snapshot";
import { safeFetchSmols } from "../api/smols";
import {
  buildTagStats,
  mergeTagStats,
  sortTagStats,
} from "../../utils/tagStats";

export type TagSortMode =
  | "popularity"
  | "frequency"
  | "alphabetical"
  | "recent";

export type TagDataSource = "snapshot" | "snapshot+live";

export interface TagStat {
  tag: string;
  key: string;
  count: number;
  popularity: number;
  latest?: string;
}

export interface TagMeta {
  snapshotTagsCount: number;
  liveTagsCount: number;
  finalTagsCount: number;
  dataSourceUsed: TagDataSource;
}

async function fetchLiveSmols(): Promise<Smol[]> {
  try {
    const smols = await safeFetchSmols();
    return Array.isArray(smols) ? smols : [];
  } catch {
    return [];
  }
}

// OOM FIX: Made async to use getSnapshotAsync
export async function getSnapshotTagStats(): Promise<{ tags: TagStat[]; meta: TagMeta }> {
  const snapshotSmols = await getSnapshotAsync();
  const snapshotTags = buildTagStats(snapshotSmols) as TagStat[];

  return {
    tags: snapshotTags,
    meta: {
      snapshotTagsCount: snapshotTags.length,
      liveTagsCount: 0,
      finalTagsCount: snapshotTags.length,
      dataSourceUsed: "snapshot",
    },
  };
}

export async function getUnifiedTags(options?: {
  liveSmols?: Smol[];
}): Promise<{
  tags: TagStat[];
  meta: TagMeta;
}> {
  const snapshotSmols = await getSnapshotAsync();
  const snapshotTags = buildTagStats(snapshotSmols) as TagStat[];

  const liveSmols =
    options?.liveSmols && options.liveSmols.length > 0
      ? options.liveSmols
      : await fetchLiveSmols();
  const liveTags = buildTagStats(liveSmols) as TagStat[];

  let mergedSmols = snapshotSmols;
  let dataSourceUsed: TagDataSource = "snapshot";

  if (liveSmols.length > 0) {
    // Merge live data with snapshot (no longer async after snapshot is loaded)
    const snapshotMap = new Map(snapshotSmols.map((s) => [s.Id, s]));
    mergedSmols = liveSmols.map((newSmol) => {
      const oldSmol = snapshotMap.get(newSmol.Id);
      return {
        ...newSmol,
        Tags: newSmol.Tags && newSmol.Tags.length > 0 ? newSmol.Tags : oldSmol?.Tags || [],
        Address: newSmol.Address || oldSmol?.Address || undefined,
        Minted_By: newSmol.Minted_By || oldSmol?.Minted_By || undefined,
      };
    });
    const liveIds = new Set(liveSmols.map((s) => s.Id));
    snapshotSmols.forEach((oldSmol) => {
      if (!liveIds.has(oldSmol.Id)) {
        mergedSmols.push(oldSmol);
      }
    });
    dataSourceUsed = "snapshot+live";
  }

  const mergedTags = buildTagStats(mergedSmols) as TagStat[];
  const finalTags = mergeTagStats(snapshotTags, mergedTags) as TagStat[];

  const tags =
    finalTags.length >= snapshotTags.length ? finalTags : snapshotTags;

  return {
    tags,
    meta: {
      snapshotTagsCount: snapshotTags.length,
      liveTagsCount: liveTags.length,
      finalTagsCount: tags.length,
      dataSourceUsed,
    },
  };
}

export function shouldLogTagDiagnostics(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") return true;
  } catch {
    // ignore
  }

  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export { sortTagStats };
