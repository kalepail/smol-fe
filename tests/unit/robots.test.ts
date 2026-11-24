import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isIndexableSong, robotsContent } from '../../src/utils/robots.ts';
import { songSafety } from '../../src/utils/songSafety.ts';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));

test('only smol.xyz is indexable; next/preview/local hosts are noindex, nofollow globally', () => {
  assert.equal(robotsContent({ hostname: 'smol.xyz' }), 'index, follow');
  for (const hostname of ['next.smol.xyz', 'noot.smol.xyz', 'app.smol.xyz', '127.0.0.1', 'localhost']) {
    assert.equal(robotsContent({ hostname }), 'noindex, nofollow', hostname);
    assert.equal(robotsContent({ hostname, noindex: true }), 'noindex, nofollow', `${hostname} + noindex`);
    assert.equal(robotsContent({ hostname, noindex: true, nofollow: true }), 'noindex, nofollow');
  }
});

test('smol.xyz honours page opt-outs: hidden mixtape = noindex, private song = noindex, nofollow', () => {
  assert.equal(robotsContent({ hostname: 'smol.xyz', noindex: true }), 'noindex');
  assert.equal(robotsContent({ hostname: 'smol.xyz', noindex: true, nofollow: true }), 'noindex, nofollow');
  assert.equal(robotsContent({ hostname: 'smol.xyz', nofollow: true }), 'index, follow', 'nofollow alone never de-indexes');
});

test('AE-3: public songs are indexable, private / flagged / unpublished / missing are not', () => {
  assert.equal(isIndexableSong(fixture('smol-minted')), true);
  assert.equal(isIndexableSong(fixture('smol-1take')), true);
  assert.equal(isIndexableSong(fixture('smol-private')), false, 'Public === 0');
  assert.equal(isIndexableSong(fixture('smol-flagged')), false, 'Public 0 + nsfw unsafe');
  assert.equal(isIndexableSong(fixture('smol-generating')), false, 'no D1 row yet (unpublished)');
  assert.equal(isIndexableSong(null), false, '404 / auth-only response');
  assert.equal(isIndexableSong(undefined), false);
  assert.equal(isIndexableSong({ d1: { Public: 1 }, kv_do: { nsfw: { safe: false } } }), false, 'restricted');
  assert.equal(isIndexableSong({ d1: {} }), false, 'unknown visibility is never indexed');
});

test('a private song on production emits noindex, nofollow end to end', () => {
  const noindex = !isIndexableSong(fixture('smol-private'));
  assert.equal(robotsContent({ hostname: 'smol.xyz', noindex, nofollow: noindex }), 'noindex, nofollow');
  const pub = !isIndexableSong(fixture('smol-minted'));
  assert.equal(robotsContent({ hostname: 'smol.xyz', noindex: pub, nofollow: pub }), 'index, follow');
});

test('current D1 visibility wins over the stale original generation payload.public', () => {
  // Publishing updates D1 only: a song generated private and published later.
  const published = { d1: { Public: 1 }, kv_do: { payload: { public: false }, nsfw: { safe: true } } };
  assert.equal(isIndexableSong(published), true);
  assert.equal(robotsContent({ hostname: 'smol.xyz', noindex: false, nofollow: false }), 'index, follow');
  // Unpublished after a public generation: D1 says private.
  assert.equal(isIndexableSong({ d1: { Public: 0 }, kv_do: { payload: { public: true }, nsfw: { safe: true } } }), false);
});

test('robots uses the exact UI restriction predicate (songSafety, as SmolDisplay)', () => {
  const pub = (nsfw: unknown) => ({ d1: { Public: 1 }, kv_do: { nsfw } }) as Parameters<typeof isIndexableSong>[0];
  // Safety unknown with `safe` missing → restricted in the UI → never indexed.
  assert.equal(isIndexableSong(pub({ unknown: true })), false);
  assert.equal(isIndexableSong(pub({ unknown: true, safe: true })), false, 'unknown overrides safe');
  assert.equal(isIndexableSong(pub({ unknown: true, safe: false })), false);
  assert.equal(isIndexableSong(pub({ safe: false })), false);
  assert.equal(isIndexableSong(pub({ safe: true })), true);
  assert.equal(isIndexableSong(pub({ safe: true, unknown: false })), true);
  assert.equal(isIndexableSong(pub(null)), true, 'no nsfw record: not restricted in the UI either');
  for (const nsfw of [{ unknown: true }, { safe: false }, { safe: true }, null, { safe: true, unknown: true }]) {
    assert.equal(isIndexableSong(pub(nsfw)), !songSafety(nsfw).restricted, JSON.stringify(nsfw));
  }
});

test('SmolDisplay and SongDetailsPanel derive their restriction from songSafety (no drift)', () => {
  for (const file of ['../../src/components/smol/SmolDisplay.svelte', '../../src/components/song/SongDetailsPanel.svelte']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /songSafety\(/, file);
    assert.doesNotMatch(source, /nsfw\.safe === false/, `${file} must not re-implement the predicate`);
  }
});
