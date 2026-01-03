/**
 * @typedef {import("../types/domain").Smol} Smol
 */

/**
 * @typedef {Object} TagStat
 * @property {string} tag
 * @property {string} key
 * @property {number} count
 * @property {number} popularity
 * @property {string} [latest]
 */

/**
 * Normalize a tag key for dedupe.
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTagKey(tag) {
  return tag.trim().toLowerCase();
}

/**
 * Extract unique tags for a smol entry.
 * @param {Smol} smol
 * @returns {string[]}
 */
export function extractSmolTags(smol) {
  const tags = new Set();

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
 * @param {Smol[]} smols
 * @returns {TagStat[]}
 */
export function buildTagStats(smols) {
  const stats = new Map();

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
 * @param {TagStat[]} baseTags
 * @param {TagStat[]} incomingTags
 * @returns {TagStat[]}
 */
export function mergeTagStats(baseTags, incomingTags) {
  const merged = new Map();

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
 * @param {TagStat[]} tags
 * @param {"popularity" | "frequency" | "alphabetical" | "recent"} mode
 * @returns {TagStat[]}
 */
export function sortTagStats(tags, mode) {
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
    sorted.sort((a, b) => b.count - a.count);
  }

  return sorted;
}
