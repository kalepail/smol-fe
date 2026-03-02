import type { Smol } from "../types/domain";

export interface TagStat {
  tag: string;
  key: string;
  count: number;
  popularity: number;
  latest?: string;
}

/**
 * Normalize a tag key for dedupe.
 */
export function normalizeTagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Extract unique tags for a smol entry.
 */
export function extractSmolTags(smol: Smol): string[] {
  const tags = new Set<string>();

  if (smol.Tags) {
    smol.Tags.forEach((tag) => tags.add(tag));
  }
  if (smol.lyrics?.style) {
    smol.lyrics.style.forEach((tag) => tags.add(tag));
  }

  return Array.from(tags)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Build tag stats from smols.
 */
export function buildTagStats(smols: Smol[]): TagStat[] {
  const stats = new Map<string, TagStat>();

  smols.forEach((smol) => {
    const date = smol.Created_At || "1970-01-01";
    const weight = (smol.Plays || 0) + (smol.Views || 0) * 0.1;

    extractSmolTags(smol).forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key) return;

      const existing = stats.get(key);
      if (existing) {
        existing.count += 1;
        existing.popularity += weight;
        if (!existing.latest || date > existing.latest) {
          existing.latest = date;
        }
      } else {
        stats.set(key, {
          tag,
          key,
          count: 1,
          popularity: weight,
          latest: date,
        });
      }
    });
  });

  return Array.from(stats.values()).map((stat) => ({
    ...stat,
    popularity: Math.round(stat.popularity),
  }));
}

/**
 * Merge tag stats without shrinking the base set.
 */
export function mergeTagStats(baseTags: TagStat[], incomingTags: TagStat[]): TagStat[] {
  const merged = new Map<string, TagStat>();

  baseTags.forEach((tag) => {
    merged.set(tag.key || normalizeTagKey(tag.tag), { ...tag });
  });

  incomingTags.forEach((tag) => {
    const key = tag.key || normalizeTagKey(tag.tag);
    const existing = merged.get(key);
    merged.set(key, {
      ...tag,
      key,
      tag: existing?.tag || tag.tag,
    });
  });

  return Array.from(merged.values());
}

/**
 * Sort tags without filtering.
 */
export function sortTagStats(tags: TagStat[], mode: "popularity" | "frequency" | "alphabetical" | "recent"): TagStat[] {
  const sorted = [...tags];

  if (mode === "popularity") {
    sorted.sort(
      (a, b) => b.popularity - a.popularity || b.count - a.count,
    );
  } else if (mode === "alphabetical") {
    sorted.sort((a, b) => a.tag.localeCompare(b.tag));
  } else if (mode === "recent") {
    sorted.sort((a, b) => (b.latest || "").localeCompare(a.latest || ""));
  } else {
    // Frequency default
    sorted.sort((a, b) => b.count - a.count);
  }

  return sorted;
}
