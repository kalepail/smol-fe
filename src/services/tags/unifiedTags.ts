import type { Smol } from "../../types/domain";
import { getGlobalSnapshot, mergeSmolsWithSnapshot } from "../api/snapshot";
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

export function getSnapshotTagStats(): { tags: TagStat[]; meta: TagMeta } {
  const snapshotSmols = getGlobalSnapshot();
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
  const snapshotSmols = getGlobalSnapshot();
  const snapshotTags = buildTagStats(snapshotSmols) as TagStat[];

  const liveSmols =
    options?.liveSmols && options.liveSmols.length > 0
      ? options.liveSmols
      : await fetchLiveSmols();
  const liveTags = buildTagStats(liveSmols) as TagStat[];

  let mergedSmols = snapshotSmols;
  let dataSourceUsed: TagDataSource = "snapshot";

  if (liveSmols.length > 0) {
    mergedSmols = mergeSmolsWithSnapshot(liveSmols);
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
