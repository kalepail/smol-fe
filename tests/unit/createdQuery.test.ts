import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATED_QUERY_MAX,
  CREATED_QUERY_OWNER_KEY,
  activeCreatedQuery,
  isForeignCreatedQuery,
  readCreatedQuery,
  stampCreatedQueryOwner,
  withCreatedQuery,
} from '../../src/utils/createdQuery.ts';

test('readCreatedQuery decodes ?q= and clamps it to 100 characters', () => {
  assert.equal(readCreatedQuery(''), '');
  assert.equal(readCreatedQuery('?other=1'), '');
  assert.equal(readCreatedQuery('?q=Neon%20Arcade'), 'Neon Arcade');
  assert.equal(readCreatedQuery('?q=100%25%20Pure_Signal'), '100% Pure_Signal');
  assert.equal(readCreatedQuery(`?q=${'a'.repeat(150)}`).length, CREATED_QUERY_MAX);
});

test('activeCreatedQuery trims (whitespace-only means no filter) and clamps', () => {
  assert.equal(activeCreatedQuery('   '), '');
  assert.equal(activeCreatedQuery('  neon  '), 'neon');
  assert.equal(activeCreatedQuery(`${'b'.repeat(120)}`).length, CREATED_QUERY_MAX);
});

test('withCreatedQuery sets or drops q and keeps other params and the hash', () => {
  assert.equal(withCreatedQuery('https://smol.xyz/created', 'neon'), 'https://smol.xyz/created?q=neon');
  assert.equal(withCreatedQuery('https://smol.xyz/created?q=old&x=1#top', ''), 'https://smol.xyz/created?x=1#top');
  const special = new URL(withCreatedQuery('https://smol.xyz/created', '100% a_b&c'));
  assert.equal(special.searchParams.get('q'), '100% a_b&c');
  assert.equal(withCreatedQuery('https://smol.xyz/created', ''), 'https://smol.xyz/created');
});

test('stampCreatedQueryOwner keeps Astro ClientRouter state and sets or removes the owner', () => {
  const astro = { index: 3, scrollX: 0, scrollY: 120 };
  const stamped = stampCreatedQueryOwner(astro, 'CA');
  assert.deepEqual(stamped, { ...astro, [CREATED_QUERY_OWNER_KEY]: 'CA' });
  assert.deepEqual(astro, { index: 3, scrollX: 0, scrollY: 120 }, 'input not mutated');
  assert.deepEqual(stampCreatedQueryOwner(stamped, null), astro);
  assert.deepEqual(stampCreatedQueryOwner(null, 'CA'), { [CREATED_QUERY_OWNER_KEY]: 'CA' });
});

test('isForeignCreatedQuery: only a stamp from a different (or now signed-out) account is foreign', () => {
  const stamped = stampCreatedQueryOwner({ index: 1 }, 'CA');
  assert.equal(isForeignCreatedQuery(stamped, 'CA'), false, 'same-account Back keeps the filter');
  assert.equal(isForeignCreatedQuery(stamped, 'CB'), true, 'account switch');
  assert.equal(isForeignCreatedQuery(stamped, null), true, 'signed out since');
  assert.equal(isForeignCreatedQuery({ index: 1 }, 'CB'), false, 'unstamped external deep link');
  assert.equal(isForeignCreatedQuery(null, null), false);
});
