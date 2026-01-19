import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTagStats,
  mergeTagStats,
  normalizeTagKey,
  sortTagStats,
} from "../src/utils/tagStats.ts";

test("buildTagStats dedupes tags by normalized key", () => {
  const smols = [
    { Tags: ["Lo-Fi", "chill"], lyrics: { style: ["Chill"] } },
    { Tags: ["lo-fi"], lyrics: { style: [] } },
  ];

  const stats = buildTagStats(smols);
  const keys = stats.map((tag) => tag.key).sort();

  assert.deepEqual(keys, [normalizeTagKey("Chill"), normalizeTagKey("Lo-Fi")]);
});

test("mergeTagStats keeps snapshot tags even when live is smaller", () => {
  const snapshotTags = [
    { tag: "Lo-Fi", key: "lo-fi", count: 10, popularity: 20 },
    { tag: "Chill", key: "chill", count: 5, popularity: 5 },
  ];
  const liveTags = [{ tag: "Lo-Fi", key: "lo-fi", count: 12, popularity: 30 }];

  const merged = mergeTagStats(snapshotTags, liveTags);
  const mergedKeys = merged.map((tag) => tag.key).sort();

  assert.deepEqual(mergedKeys, ["chill", "lo-fi"]);
});

test("sortTagStats orders without filtering", () => {
  const tags = [
    { tag: "B", key: "b", count: 2, popularity: 5, latest: "2023-01-01" },
    { tag: "A", key: "a", count: 3, popularity: 1, latest: "2024-01-01" },
  ];

  const alphabetical = sortTagStats(tags, "alphabetical");
  const popularity = sortTagStats(tags, "popularity");
  const recent = sortTagStats(tags, "recent");

  assert.equal(alphabetical.length, tags.length);
  assert.equal(popularity.length, tags.length);
  assert.equal(recent.length, tags.length);
  assert.equal(alphabetical[0].tag, "A");
  assert.equal(popularity[0].tag, "B");
  assert.equal(recent[0].tag, "A");
});
