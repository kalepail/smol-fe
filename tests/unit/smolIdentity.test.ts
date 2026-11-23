import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Networks } from '@stellar/stellar-sdk/minimal';
import { deriveSmolIdentity, findIdentityCollisions } from '../../src/utils/smolIdentity.ts';

const opts = { factory: 'CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA', networkPassphrase: Networks.PUBLIC };

test('Report 31 fixture: canonical 64-hex id derives the audited SAC + pool', () => {
  const id = deriveSmolIdentity('7cf9dd5c96a0f4a14fbd8757e609a5a3ac02c719aeed17a184041ee643765c60', opts)!;
  assert.equal(id.sac, 'CB3243T7LCV4F7YWWR2QS3LQ2E7GDYNZS7EM275YUDD3GKMZOQBIGFG4');
  assert.equal(id.pool, 'CATG4BDEBN67UX5U336AK6OUZCYEYL4ZOGGXJAJ2AL4F2KCCJV7LRYER');
});

test('#6 short hex aliases ("1" vs "01") and non-canonical case are never derived', () => {
  assert.equal(deriveSmolIdentity('1', opts), null);
  assert.equal(deriveSmolIdentity('01', opts), null);
  assert.equal(deriveSmolIdentity('legacy-song', opts), null);
  assert.equal(deriveSmolIdentity('7CF9DD5C96A0F4A14FBD8757E609A5A3AC02C719AEED17A184041EE643765C60', opts), null);
});

test('#6 distinct ids that share a derived SAC are all flagged as colliding', () => {
  const a = deriveSmolIdentity('aaaaaaaaaaaa' + '0'.repeat(52), opts)!;
  const b = deriveSmolIdentity('aaaaaaaaaaaa' + '1'.repeat(52), opts)!;
  const c = deriveSmolIdentity('b'.repeat(64), opts)!;
  assert.equal(a.sac, b.sac, 'same first 12 chars ⇒ same asset code ⇒ same SAC');
  assert.deepEqual([...findIdentityCollisions([a, b, c])].sort(), [a.id, b.id].sort());
  assert.equal(findIdentityCollisions([a, a, c]).size, 0, 'the same id twice is not a collision');
});
