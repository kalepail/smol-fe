import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftPayloadKey,
  isEditSessionDirty,
  type MergeSourceSnapshot,
  type MixtapeEditSession,
} from '../../src/stores/mixtape/operations.ts';
import {
  editSlotKey,
  loadEditSlotsFromStorage,
  persistEditSlot,
} from '../../src/stores/mixtape/persistence.ts';
import { createLatestGate } from '../../src/utils/latestRequest.ts';
import { parseRetryAfter } from '../../src/utils/httpRetry.ts';

function withMockLocalStorage(initial: Record<string, string>, run: () => void) {
  const backing = new Map<string, string>(Object.entries(initial));
  const localStorage = new Proxy(
    {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, String(value));
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
    },
    {
      ownKeys: () => [...backing.keys()],
      getOwnPropertyDescriptor: (_target, prop) =>
        typeof prop === 'string' && backing.has(prop)
          ? { enumerable: true, configurable: true, value: backing.get(prop) }
          : undefined,
    }
  );
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage };
  try {
    run();
  } finally {
    if (prevWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = prevWindow;
  }
}

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

test('edit slots load per owner from localStorage; foreign / creator-less / corrupt slots never surface', () => {
  withMockLocalStorage(
    {
      [editSlotKey('CA')]: JSON.stringify(session('CA', 'm1')),
      [editSlotKey('CB')]: JSON.stringify(session('CB', 'm2')),
      [editSlotKey('CC')]: JSON.stringify(session('CA', 'm3')), // foreign owner mismatch
      [editSlotKey('')]: JSON.stringify(session('', 'm4')), // empty owner
      [editSlotKey('CD')]: JSON.stringify({ mixtapeId: 'm5' }), // missing baseline
      [editSlotKey('CE')]: '{not-json',
      'unrelated:key': JSON.stringify(session('CA', 'm9')),
    },
    () => {
      const slots = loadEditSlotsFromStorage();
      assert.deepEqual(Object.keys(slots).sort(), ['CA', 'CB']);
      assert.equal(slots.CA.mixtapeId, 'm1');
      assert.equal(slots.CB.mixtapeId, 'm2');

      // persistEditSlot refuses foreign writes and removes on null.
      persistEditSlot('CB', session('CA', 'm99') as MixtapeEditSession);
      assert.equal(loadEditSlotsFromStorage().CB, undefined);
    }
  );
});

test('edit slot keeps mergeFrom and dirty tracking', () => {
  const reviewed: MergeSourceSnapshot = { id: 'src', title: 'Old copy' };
  withMockLocalStorage(
    {
      [editSlotKey('CA')]: JSON.stringify(session('CA', 'm1', { mergeFrom: reviewed })),
      [editSlotKey('CB')]: JSON.stringify({ ...session('CB', 'm2'), mergeFrom: { title: 'no id' } }),
    },
    () => {
      const slots = loadEditSlotsFromStorage();
      assert.deepEqual(slots.CA.mergeFrom, reviewed);
      assert.equal(slots.CB.mergeFrom, null);
      assert.equal(isEditSessionDirty(slots.CA), true, 'title differs from baseline');
      assert.equal(isEditSessionDirty({ ...slots.CA, title: 'Server title' }), false);
    }
  );
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

test('25d pass 3 P1-3/P2-1: create payload key ignores whitespace-only edits, not real changes', () => {
  const t = (id: string) => ({ id });
  const base = { title: 'Pending Mix', description: 'Late night', tracks: [t('a'), t('b')] };
  const key = draftPayloadKey(base);
  assert.equal(draftPayloadKey({ ...base, title: 'Pending Mix ' }), key, 'trailing space is the same POST');
  assert.equal(draftPayloadKey({ ...base, description: '  Late night\n' }), key);
  assert.notEqual(draftPayloadKey({ ...base, title: 'Pending Mix 2' }), key);
  assert.notEqual(draftPayloadKey({ ...base, tracks: [t('b'), t('a')] }), key, 'order matters');
  assert.notEqual(draftPayloadKey({ ...base, tracks: [t('a'), t('b'), t('c')] }), key, 'another tab added a song');
});
