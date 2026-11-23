import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  classifyOwnerMixtapes,
  findBorderlinePair,
  mixtapeAdvice,
  normalizeMixtapeText,
  scoreFromSimilarity,
  type MixtapeCandidate,
} from '../../src/utils/mixtapeVisibility.ts';
import {
  hiddenReasonLabel,
  mergePreview,
  previewMixtapeChange,
  storedTracksFor,
  type CohortMixtape,
} from '../../src/utils/mixtapeCoaching.ts';

interface FixtureMixtape { Id: string; Title: string; Desc: string; Address: string; Created_At: string; Smols: string }
interface FixtureSmol { Id: string; Public: number }

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/mixtapes-live-18.json', import.meta.url), 'utf8')) as {
  mixtapes: FixtureMixtape[];
  smols: FixtureSmol[];
};

const CORDOVA = '5667a5407767f926';
const CORDOVA_RETRY = '8c177735936943bd';
const CREASY_V1 = '1124d0d7162bd55a';
const CREASY_V2 = 'ce800366c10afa35';
const OUR_DECEMBER = 'c50ccefe83080d26';
const PRE_PARTY = '623d81b716c1e0e5';
const HOLIDAY_ANTHOLOGY = '119beb8a7bffc83d';
const byId = (id: string) => FIXTURE.mixtapes.find((m) => m.Id === id)!;
const PUBLIC = new Set(FIXTURE.smols.filter((s) => s.Public).map((s) => s.Id));

/** Same LCG shuffle the backend suite uses, so both repos exercise identical orders. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function toCandidates(mixtapes: FixtureMixtape[]): MixtapeCandidate[] {
  return mixtapes.map((m) => {
    const stored = m.Smols.split(',');
    return { id: m.Id, address: m.Address, title: m.Title, desc: m.Desc, createdAt: m.Created_At, storedTracks: stored, publicTracks: stored.filter((id) => PUBLIC.has(id)) };
  });
}

/** What GET /mixtapes/mine would hand the FE for one fixture row. */
function toOwned(m: FixtureMixtape): CohortMixtape {
  const stored = m.Smols.split(',');
  return {
    id: m.Id,
    title: m.Title,
    description: m.Desc,
    creator: m.Address,
    createdAt: m.Created_At,
    trackIds: stored.filter((id) => PUBLIC.has(id)),
    storedTrackCount: stored.length,
  };
}

test('FE classifier is a byte-identical mirror of the live smol-workflow classifier', () => {
  const backend = new URL('../../../smol-workflow/src/utils/mixtape-visibility.ts', import.meta.url);
  if (!existsSync(backend)) return; // standalone checkout: the fixture test below still pins behavior
  const fe = readFileSync(new URL('../../src/utils/mixtapeVisibility.ts', import.meta.url), 'utf8');
  assert.equal(fe, readFileSync(backend, 'utf8'), 'src/utils/mixtapeVisibility.ts drifted from smol-workflow/src/utils/mixtape-visibility.ts');
});

test('18-row production snapshot: 15 public / 3 owner-only in any order, Pre-Party preserved', () => {
  assert.equal(FIXTURE.mixtapes.length, 18);
  const expected = new Map([
    [CORDOVA_RETRY, { hiddenReason: 'duplicate', relatedId: CORDOVA }],
    [CREASY_V1, { hiddenReason: 'superseded', relatedId: CREASY_V2 }],
    [OUR_DECEMBER, { hiddenReason: 'empty', relatedId: null }],
  ]);

  for (let seed = 1; seed <= 25; seed += 1) {
    const candidates = toCandidates(seededShuffle(FIXTURE.mixtapes, seed));
    const decisions = classifyOwnerMixtapes(candidates);
    const hidden = [...decisions.values()].filter((d) => d.visibility === 'owner');
    assert.equal(decisions.size, 18);
    assert.equal(decisions.size - hidden.length, 15, `seed ${seed}: 15 public`);
    assert.deepEqual(new Map(hidden.map((d) => [d.id, { hiddenReason: d.hiddenReason, relatedId: d.relatedId }])), expected, `seed ${seed}`);
    assert.equal(decisions.get(PRE_PARTY)!.visibility, 'public', 'Pre-Party (100% inside a cross-owner anthology) stays public');
    assert.equal(decisions.get(HOLIDAY_ANTHOLOGY)!.visibility, 'public');
    assert.equal(findBorderlinePair(candidates, decisions), null, 'zero prod pairs in the borderline band');
    for (const d of decisions.values()) {
      assert.ok(d.uniquenessScore === null || (d.uniquenessScore >= 0 && d.uniquenessScore <= 100));
      if (d.visibility === 'owner') assert.equal(d.advice, mixtapeAdvice(d.hiddenReason, d.relatedTitle));
      else assert.equal(d.advice, null);
    }
  }

  // Duplicate keeps the EARLIEST row so the original shared link stays canonical.
  assert.ok(byId(CORDOVA).Created_At < byId(CORDOVA_RETRY).Created_At);
  // Superseded keeps the LARGER row.
  const decisions = classifyOwnerMixtapes(toCandidates(FIXTURE.mixtapes));
  assert.equal(decisions.get(CREASY_V1)!.relatedTitle, byId(CREASY_V2).Title);
  assert.equal(decisions.get(CREASY_V1)!.uniquenessScore, 0);
  assert.match(decisions.get(CORDOVA_RETRY)!.advice!, /exact copy/);
  assert.match(decisions.get(OUR_DECEMBER)!.advice!, /None of the songs/);
});

test('same-owner boundary: a verbatim cross-owner copy never hides either side', () => {
  const cordova = byId(CORDOVA);
  const copy = { ...cordova, Id: 'ffff000000000001', Address: 'COTHEROWNER', Created_At: '2026-05-01 00:00:00' };
  const decisions = classifyOwnerMixtapes(toCandidates([...FIXTURE.mixtapes, copy]));
  assert.equal(decisions.get(copy.Id)!.visibility, 'public');
  assert.equal(decisions.get(CORDOVA)!.visibility, 'public');
  assert.equal(decisions.get(CORDOVA)!.uniquenessScore, 100);
});

test('synthetic rules: overlap J>=0.80 keeps the larger/newer, too_few <2, empty, scores', () => {
  const syn = (n: number) => `syn-${n}`;
  const mk = (id: string, tracks: number[], createdAt: string): MixtapeCandidate => ({
    id, address: 'COWNER', title: id, desc: '', createdAt, publicTracks: tracks.map(syn),
  });
  const d = classifyOwnerMixtapes([
    mk('a', [1, 2, 3, 4, 5, 6, 7, 8, 9], '2026-01-01 00:00:00'),
    mk('b', [1, 2, 3, 4, 5, 6, 7, 8, 10], '2026-01-02 00:00:00'),
    mk('c', [50], '2026-01-03 00:00:00'),
    mk('e', [], '2026-01-04 00:00:00'),
    mk('short1', [60, 61], '2026-01-05 00:00:00'),
    mk('short2', [60, 62], '2026-01-06 00:00:00'),
  ]);
  assert.deepEqual([d.get('a')!.hiddenReason, d.get('a')!.relatedId, d.get('a')!.uniquenessScore], ['overlap', 'b', 20]);
  assert.equal(d.get('b')!.visibility, 'public');
  assert.equal(d.get('c')!.hiddenReason, 'too_few');
  assert.match(d.get('c')!.advice!, /Add 1 more song to show on the Mixtapes page/);
  assert.equal(d.get('e')!.hiddenReason, 'empty');
  assert.equal(d.get('short1')!.visibility, 'public', 'overlap needs >= 3 songs on both sides');
  assert.equal(d.get('short2')!.visibility, 'public');
  assert.equal(scoreFromSimilarity(0.8), 20);
  assert.equal(normalizeMixtapeText('  Ｃreasy   DROPS '), 'creasy drops');
});

test('previewMixtapeChange: create duplicate/superseded/superset/too_few and edit relist', () => {
  const owner = byId(CREASY_V2).Address;
  const mine = FIXTURE.mixtapes.filter((m) => m.Address === owner).map(toOwned);
  const v2 = mine.find((m) => m.id === CREASY_V2)!;
  const v1 = mine.find((m) => m.id === CREASY_V1)!;
  const draft = (trackIds: string[], title = 'Creasy Drops v2') => ({ title, description: '', trackIds });

  // Draft with the same songs as the listed keeper -> superseded/duplicate-style match on "Creasy Drops".
  const subset = previewMixtapeChange(mine, owner, { kind: 'create', draft: draft(v2.trackIds.slice(0, 2)) });
  assert.equal(subset.self.visibility, 'owner');
  assert.equal(subset.self.hiddenReason, 'superseded');
  assert.deepEqual(subset.match, { id: CREASY_V2, title: v2.title });

  // Draft that contains the keeper plus one more song: the draft wins, the keeper would be hidden.
  const superset = previewMixtapeChange(mine, owner, { kind: 'create', draft: draft([...v2.trackIds, 'brand-new']) });
  assert.equal(superset.self.visibility, 'public');
  assert.deepEqual(superset.newlyHidden.map((i) => [i.id, i.hiddenReason]), [[CREASY_V2, 'superseded']]);

  // Same songs under a new title is a Tier 2 borderline edition: listed by Tier 1, flagged softly.
  const edition = previewMixtapeChange(mine, owner, { kind: 'create', draft: draft(v2.trackIds, 'Creasy Drops (Deluxe)') });
  assert.equal(edition.self.visibility, 'public');
  assert.deepEqual(edition.borderline, { id: CREASY_V2, title: v2.title, trigger: 'same_set_changed' });
  assert.equal(subset.borderline, null, 'hidden drafts never report a borderline pair');

  // A 1-song draft of a brand-new song is too_few (non-punitive coaching).
  const single = previewMixtapeChange(mine, owner, { kind: 'create', draft: draft(['only-one']) });
  assert.equal(single.self.hiddenReason, 'too_few');
  assert.equal(single.match, null);

  // Editing the hidden v1 to add a song v2 does not have -> it will be listed after save.
  const relist = previewMixtapeChange(mine, owner, { kind: 'edit', id: CREASY_V1, draft: draft([...v1.trackIds, 'brand-new'], v1.title) });
  assert.equal(relist.self.visibility, 'public');
  assert.equal(relist.self.hiddenReason, null);

  // Cross-owner rows passed by mistake never influence the preview.
  const noisy = previewMixtapeChange(FIXTURE.mixtapes.map(toOwned), owner, { kind: 'edit', id: CREASY_V1, draft: draft(v1.trackIds, v1.title) });
  assert.equal(noisy.self.hiddenReason, 'superseded');
});

test('preview agrees with the classifier on every live row (edit = no-op)', () => {
  const all = FIXTURE.mixtapes.map(toOwned);
  const decisions = classifyOwnerMixtapes(toCandidates(FIXTURE.mixtapes));
  for (const row of all) {
    const preview = previewMixtapeChange(all, row.creator, { kind: 'edit', id: row.id, draft: { title: row.title, description: row.description, trackIds: row.trackIds } });
    const truth = decisions.get(row.id)!;
    // A row with private stored songs is previewed with its public list as the stored list (what an edit would save).
    if ((row.storedTrackCount ?? 0) === row.trackIds.length) {
      assert.equal(preview.self.visibility, truth.visibility, row.id);
      assert.equal(preview.self.hiddenReason, truth.hiddenReason, row.id);
      assert.equal(preview.self.relatedId, truth.relatedId, row.id);
    }
  }
});

test('storedTracksFor pads private slots so a draft is never an exact retry of them', () => {
  const row: CohortMixtape = { id: 'x', title: 't', description: '', creator: 'C', createdAt: '2026-01-01 00:00:00', trackIds: ['a', 'b'], storedTrackCount: 3 };
  assert.equal(storedTracksFor(row).length, 3);
  assert.deepEqual(storedTracksFor({ ...row, storedTrackCount: 2 }), ['a', 'b']);
});

test('labels and merge preview', () => {
  assert.equal(hiddenReasonLabel('superseded', 'Creasy Drops'), 'Already in "Creasy Drops"');
  assert.equal(hiddenReasonLabel('too_few'), 'Needs 1 more song');
  assert.deepEqual(mergePreview(['a', 'b', 'c'], ['b', 'x']), { added: ['a', 'c'], total: 4, already: 1 });
});
