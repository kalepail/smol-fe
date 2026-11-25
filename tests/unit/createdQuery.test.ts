import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATED_QUERY_MAX,
  activeCreatedQuery,
  readCreatedQuery,
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
