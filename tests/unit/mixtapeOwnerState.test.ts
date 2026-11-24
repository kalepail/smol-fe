import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMergeSourceDeletion,
  isEditSessionDirty,
  parseEditSlots,
  type MergeSourceSnapshot,
  type MixtapeEditSession,
} from '../../src/stores/mixtape/operations.ts';
import { createLatestGate } from '../../src/utils/latestRequest.ts';
import { parseRetryAfter } from '../../src/utils/httpRetry.ts';

const session = (creator: string, mixtapeId: string, extra: Partial<MixtapeEditSession> = {}) => ({
  kind: 'edit',
  draftId: `edit-${mixtapeId}`,
  mixtapeId,
  creator,
  createdAt: '2026-11-20 10:00:00',
  revision: 3,
  title: 'Local title',
  description: '',
  tracks: [{ id: 'a', title: 'A', coverUrl: null, creator: null, public: 1 }],
  updatedAt: '2026-11-23T00:00:00.000Z',
  baseline: { title: 'Server title', description: '', trackIds: ['a'] },
  baselineVisibility: 'owner',
  baselineHiddenReason: 'superseded',
  privateTrackCount: 0,
  fromDraft: false,
  ...extra,
});

test('25d P1-2: edit slots are per owner; foreign / creator-less slots never surface', () => {
  const slots = parseEditSlots({ CA: session('CA', 'm1'), CB: session('CB', 'm2') });
  assert.deepEqual(Object.keys(slots).sort(), ['CA', 'CB']);
  assert.equal(slots.CA.mixtapeId, 'm1');
  assert.equal(slots.CB.mixtapeId, 'm2');

  // A slot filed under another account's key is dropped (B can never load A's edit).
  assert.deepEqual(parseEditSlots({ CB: session('CA', 'm1') }), {});
  // Creator-less (pre-isolation) data is dropped rather than shown to whoever is signed in.
  assert.deepEqual(parseEditSlots({ '': session('', 'm1') }), {});
  // Legacy single-session value migrates under its own creator only.
  const legacy = parseEditSlots(session('CA', 'm9'));
  assert.deepEqual(Object.keys(legacy), ['CA']);
  assert.equal(legacy.CA.mixtapeId, 'm9');
  assert.equal(legacy.CA.revision, 3);
  // Garbage never throws.
  for (const bad of [null, 1, 'x', [], { CA: { mixtapeId: 'm1' } }]) assert.deepEqual(parseEditSlots(bad), {});
});

test('edit slot keeps mergeFrom and dirty tracking', () => {
  const reviewed: MergeSourceSnapshot = { id: 'src', title: 'Old copy', revision: 4, trackIds: ['a', 'b'], storedTrackCount: 2, publicTrackCount: 2 };
  const slots = parseEditSlots({ CA: session('CA', 'm1', { mergeFrom: reviewed }) });
  assert.deepEqual(slots.CA.mergeFrom, reviewed);
  // A pre-pass-2 merge source (id + title only) can't be verified, so its pending delete is dropped.
  const legacy = parseEditSlots({ CA: { ...session('CA', 'm1'), mergeFrom: { id: 'src', title: 'Old copy' } } });
  assert.equal(legacy.CA.mergeFrom, null);
  assert.equal(isEditSessionDirty(slots.CA), true, 'title differs from baseline');
  assert.equal(isEditSessionDirty({ ...slots.CA, title: 'Server title' }), false);
});

test('25d P2-5: overlapping requests — only the newest id may write, in any resolution order', async () => {
  const gate = createLatestGate();
  let state = 'initial';
  const write = (id: number, value: string) => {
    if (gate.isCurrent(id)) state = value;
  };
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Older forced request resolves AFTER the newer one: it must not overwrite.
  const older = gate.begin();
  const newer = gate.begin();
  assert.ok(newer > older, 'ids are strictly monotonic');
  await Promise.all([
    delay(20).then(() => write(older, 'older')),
    delay(5).then(() => write(newer, 'newer')),
  ]);
  assert.equal(state, 'newer');

  // reset() (account switch) invalidates everything in flight.
  const inFlight = gate.begin();
  gate.reset();
  write(inFlight, 'stale-account');
  assert.equal(state, 'newer');
  const ids = Array.from({ length: 50 }, () => gate.begin());
  assert.ok(ids.every((id, i) => i === 0 || id > ids[i - 1]));
  assert.ok(ids.slice(0, -1).every((id) => !gate.isCurrent(id)) && gate.isCurrent(ids.at(-1)!));
});

test('25d P2-1: Retry-After parsing for 503 create_pending', () => {
  assert.equal(parseRetryAfter('1'), 1000);
  assert.equal(parseRetryAfter(null), 1000);
  assert.equal(parseRetryAfter('garbage'), 1000);
  assert.equal(parseRetryAfter('0'), 500, 'clamped up');
  assert.equal(parseRetryAfter('600'), 30_000, 'clamped down');
  const now = Date.parse('2026-11-24T00:00:00Z');
  assert.equal(parseRetryAfter('Tue, 24 Nov 2026 00:00:03 GMT', now), 3000);
});

test('25d pass 2 P1-1/P1-2: "Save & delete copy" may only delete the exact reviewed source', () => {
  const reviewed: MergeSourceSnapshot = { id: 'src', title: 'Copy', revision: 2, trackIds: ['a', 'b'], storedTrackCount: 2, publicTrackCount: 2 };
  // Exactly as reviewed and fully contained in the saved target.
  assert.deepEqual(checkMergeSourceDeletion(reviewed, reviewed, ['x', 'a', 'b']), { ok: true });
  // Source already gone: nothing to delete.
  assert.deepEqual(checkMergeSourceDeletion(reviewed, null, ['a', 'b']), { ok: false, reason: 'gone' });
  // Another client added a song to the source after review: keep it, surface the new song.
  const newer = { ...reviewed, revision: 3, trackIds: ['a', 'b', 'c'], storedTrackCount: 3, publicTrackCount: 3 };
  assert.deepEqual(checkMergeSourceDeletion(reviewed, newer, ['x', 'a', 'b']), { ok: false, reason: 'changed', fresh: newer, newTrackIds: ['c'] });
  // Private / unavailable songs would be lost with the tombstone (the direct merge's 409 rule).
  const withPrivate = { ...reviewed, storedTrackCount: 3 };
  assert.deepEqual(checkMergeSourceDeletion(reviewed, withPrivate, ['a', 'b']), { ok: false, reason: 'unavailable', count: 1 });
  // "Load latest" (or a manual removal) dropped source songs from the target: never delete.
  assert.deepEqual(checkMergeSourceDeletion(reviewed, reviewed, ['x']), { ok: false, reason: 'missing', missingIds: ['a', 'b'] });
});
