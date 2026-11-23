import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  affordableSubset,
  buildCollectPlan,
  classifyTrack,
  derivePageState,
  describeCollectCard,
  describeTrackPill,
  flowKind,
  resolveTrackIdentity,
  restoreFlow,
  serializeFlow,
  stepsFromPlan,
  summarizeMixtape,
  type ChainFacts,
  type CollectTrackInput,
  type FlowStep,
  type Holding,
  type KaleState,
  type PendingKind,
} from '../../src/utils/mixtapeOwnership.ts';
import { kaleToStroops } from '../../src/utils/mixtapePricing.ts';

const NOW = 1_800_000_000_000;
const known = (balance: bigint): Holding => ({ status: 'known', balance, checkedAt: NOW });
const err: Holding = { status: 'error', message: 'rpc 503' };
const loading: Holding = { status: 'loading' };

type Spec = { kind: 'owned' | 'available' | 'unminted' | 'noaddr' | 'unknown' | 'checking'; facts?: ChainFacts };

function track(i: number, spec: Spec): CollectTrackInput {
  const minted = spec.kind !== 'unminted' && spec.kind !== 'noaddr';
  return {
    id: `t${i}`,
    title: `Track ${i}`,
    address: spec.kind === 'noaddr' ? '' : `GCREATOR${i}`,
    mintToken: minted ? `CSAC${i}` : null,
    mintAmm: minted ? `CAMM${i}` : null,
  };
}

function holdingFor(spec: Spec): Holding {
  switch (spec.kind) {
    case 'owned':
      return known(10n ** 14n);
    case 'available':
      return known(0n);
    case 'unknown':
      return err;
    case 'checking':
      return loading;
    default:
      return { status: 'idle' };
  }
}

function scenario(specs: Spec[], opts: { signedIn?: boolean; kale?: KaleState; steps?: FlowStep[]; hydrated?: boolean; pending?: Map<string, PendingKind> } = {}) {
  const signedIn = opts.signedIn ?? true;
  const rows = specs.map((spec, i) => {
    const t = track(i + 1, spec);
    const identity = resolveTrackIdentity(t, spec.facts);
    const state = classifyTrack(identity, holdingFor(spec), opts.pending?.get(t.id) ?? null, signedIn);
    return { track: t, identity, state };
  });
  const summary = summarizeMixtape(rows.map((r) => r.state));
  const plan = signedIn ? buildCollectPlan(rows) : null;
  const kale = opts.kale ?? { status: 'known', balance: kaleToStroops(100_000), checkedAt: NOW };
  const steps = opts.steps ?? [];
  const page = derivePageState({ signedIn, summary, hydrated: opts.hydrated ?? true, kale, plan, flow: flowKind(steps) });
  const aff = plan && kale.status === 'known' ? affordableSubset(plan, kale.balance) : null;
  const affordable = aff && plan ? {
    count: aff.size,
    mints: plan.mint.filter((t) => aff.has(t.id)).length,
    costKale: plan.buy.filter((t) => aff.has(t.id)).length * 33 + plan.mint.filter((t) => aff.has(t.id)).length * 100,
  } : null;
  const card = describeCollectCard({ page, summary, plan, kale, steps, affordable });
  return { rows, summary, plan, page, card };
}

const many = (n: number, spec: Spec) => Array.from({ length: n }, () => spec);

test('S0 signed out: a (all minted), b (mixed), c (none minted)', () => {
  const a = scenario(many(12, { kind: 'available' }), { signedIn: false });
  assert.equal(a.page.state, 'S0');
  assert.equal(a.page.variant, 'a');
  assert.equal(a.card.title, '12 songs you can collect');
  assert.equal(a.card.subline, '33 KALE a song · 396 KALE for all 12');
  assert.equal(a.card.primary.label, 'Sign in to collect');

  const b = scenario([...many(8, { kind: 'owned' }), ...many(4, { kind: 'unminted' })], { signedIn: false });
  assert.equal(b.page.variant, 'b');
  assert.equal(b.card.title, '12 songs · 8 minted');
  assert.ok(b.rows.every((r) => ['available', 'unminted'].includes(r.state)), 'signed out never reveals ownership');

  const c = scenario(many(12, { kind: 'unminted' }), { signedIn: false });
  assert.equal(c.page.variant, 'c');
  assert.equal(c.card.primary.label, 'Sign in to mint');
});

test('S1 owns none, all minted', () => {
  const s = scenario(many(12, { kind: 'available' }));
  assert.equal(s.page.state, 'S1');
  assert.equal(s.card.primary.label, 'Buy all 12 · 396 KALE');
  assert.equal(s.card.note, '2 passkey approvals');
});

test('S2 owns some, rest minted', () => {
  const s = scenario([...many(7, { kind: 'owned' }), ...many(5, { kind: 'available' })]);
  assert.equal(s.page.state, 'S2');
  assert.equal(s.card.title, 'You own 7 of 12');
  assert.equal(s.card.primary.label, 'Complete mixtape · 165 KALE');
  assert.equal(s.card.note, '1 passkey approval');
});

test('S3 mixed: exact "Mint 3 & buy 4 · 432 KALE" and minting = owning', () => {
  const s = scenario([...many(5, { kind: 'owned' }), ...many(4, { kind: 'available' }), ...many(3, { kind: 'unminted' })]);
  assert.equal(s.page.state, 'S3');
  assert.equal(s.card.primary.label, 'Mint 3 & buy 4 · 432 KALE');
  assert.match(s.card.note ?? '', /No second purchase/);
  assert.equal(s.plan!.costStroops, kaleToStroops(432));
  const minted = new Set(s.plan!.mint.map((t) => t.id));
  assert.ok(s.plan!.buy.every((t) => !minted.has(t.id)), 'a minted song is never also bought');
  assert.deepEqual(s.plan!.steps.map((x) => x.id), ['mint-1', 'buy-1']);
});

test('S4 none minted', () => {
  const s = scenario(many(12, { kind: 'unminted' }));
  assert.equal(s.page.state, 'S4');
  assert.equal(s.card.primary.label, 'Mint all 12 · 1,200 KALE');
  assert.equal(s.plan!.signatures, 3);
});

test('S5 fully owned, and S5·partial with an unavailable song (C-04)', () => {
  const s = scenario(many(12, { kind: 'owned' }));
  assert.equal(s.page.state, 'S5');
  assert.equal(s.card.title, 'You own this mixtape');
  assert.equal(s.card.primary.kind, 'owned');
  assert.ok(!/Buy/.test(s.card.primary.label));

  const p = scenario([...many(11, { kind: 'owned' }), { kind: 'noaddr' }]);
  assert.equal(p.page.state, 'S5');
  assert.equal(p.page.variant, 'partial');
  assert.equal(p.card.title, 'You own every song you can');
});

test('S6 hydrating never offers Buy', () => {
  const s = scenario([...many(3, { kind: 'checking' }), ...many(2, { kind: 'available' })]);
  assert.equal(s.page.state, 'S6');
  assert.equal(s.card.primary.kind, 'skeleton');
  assert.equal(s.card.primary.action, 'none');
  const notHydrated = scenario(many(4, { kind: 'available' }), { hydrated: false });
  assert.equal(notHydrated.page.state, 'S6');
});

test('S7 / C-02: an RPC error is unknown, never 0n, and is never bought', () => {
  const s = scenario([...many(2, { kind: 'unknown' }), ...many(3, { kind: 'available' }), { kind: 'unminted' }]);
  assert.equal(s.page.state, 'S7');
  assert.equal(s.card.title, "Couldn't check what you own");
  assert.equal(s.card.primary.action, 'retryCheck');
  assert.ok(s.rows.filter((r) => r.state === 'unknown').length === 2);
  const unknownIds = new Set(s.rows.filter((r) => r.state === 'unknown').map((r) => r.track.id));
  assert.ok(s.plan!.buy.every((t) => !unknownIds.has(t.id)), 'unknown holdings are excluded from buy');
  assert.equal(s.plan!.excluded.filter((e) => e.reason === 'unknown').length, 2);
  assert.equal(s.card.secondary?.label, 'Collect the 4 we could check');
});

test('S8 overlay: exact shortfall copy and affordable subset prefers buys', () => {
  const kale: KaleState = { status: 'known', balance: kaleToStroops(120), checkedAt: NOW };
  const s = scenario([...many(5, { kind: 'owned' }), ...many(4, { kind: 'available' }), ...many(3, { kind: 'unminted' })], { kale });
  assert.equal(s.page.phase, 'S3');
  assert.equal(s.page.state, 'S8');
  assert.equal(s.card.subline, 'You have 120 KALE. This needs 432.');
  assert.equal(s.card.secondary?.label, 'Buy 3 for 99 KALE instead');
  const subset = affordableSubset(s.plan!, kale.balance);
  const narrowed = buildCollectPlan(s.rows, { selection: subset });
  assert.equal(narrowed.costKale, 99);
});

test('S9 overlay: paused flow resumes from saved progress', () => {
  const base = scenario([...many(3, { kind: 'unminted' }), ...many(4, { kind: 'available' })]);
  const steps = stepsFromPlan(base.plan!, new Map());
  steps[0].status = 'done';
  steps[1].status = 'cancelled';
  steps[1].failure = 'cancelled';
  const s = scenario([...many(3, { kind: 'owned' }), ...many(4, { kind: 'available' })], { steps });
  assert.equal(s.page.state, 'S9');
  assert.equal(s.card.title, 'Collecting paused');
  assert.equal(s.card.primary.label, 'Continue · 1 approval left');

  const raw = serializeFlow(steps, NOW);
  const restored = restoreFlow(raw, NOW + 60_000)!;
  assert.equal(restored[0].status, 'done');
  assert.equal(restored[1].costStroops, steps[1].costStroops);
  assert.equal(restoreFlow(raw, NOW + 31 * 60_000), null, '30 min TTL');

  // A reload mid-signature was never signed → cancelled; mid-submit → keep confirming.
  const mid: FlowStep[] = steps.map((x, i) => ({ ...x, status: i === 0 ? 'submitting' : 'signing' }));
  const r2 = restoreFlow(serializeFlow(mid, NOW), NOW)!;
  assert.equal(r2[0].status, 'confirming');
  assert.equal(r2[1].status, 'cancelled');
});

test('busy overlay while a submitted mint is confirming', () => {
  const pending = new Map<string, PendingKind>([['t1', 'mint']]);
  const s = scenario([{ kind: 'unminted' }, { kind: 'available' }], {
    pending,
    steps: [{ id: 'mint-1', kind: 'mint', trackIds: ['t1'], titles: ['Track 1'], costStroops: kaleToStroops(100), status: 'confirming' }],
  });
  assert.equal(s.rows[0].state, 'minting');
  assert.equal(s.page.overlay, 'busy');
  assert.equal(s.card.primary.action, 'openSheet');
  assert.ok(!s.plan!.mint.some((t) => t.id === 't1'), 'never re-plans an in-flight mint');
});

test('C-04: songs with no creator Address are unavailable and cost nothing', () => {
  const s = scenario([{ kind: 'noaddr' }, { kind: 'unminted' }]);
  assert.equal(s.rows[0].state, 'unavailable');
  assert.deepEqual(s.plan!.mint.map((t) => t.id), ['t2']);
  assert.equal(s.plan!.costKale, 100);
  assert.equal(describeTrackPill('unavailable', { signedIn: true }).label, 'Not available yet');
});

test('C-15 / Report 31 identity: chain facts beat stale or cross-wired D1', () => {
  const t = track(1, { kind: 'unminted' });
  const unindexed = resolveTrackIdentity(t, { status: 'minted', sac: 'CDERIVED', pool: 'CPOOL' });
  assert.equal(unindexed.mint, 'minted');
  assert.ok(unindexed.mint === 'minted' && unindexed.unindexed && unindexed.sac === 'CDERIVED');
  // Someone minted it after page load: plan buys it instead of re-minting.
  const state = classifyTrack(unindexed, known(0n));
  assert.equal(state, 'available');

  const crossWired = resolveTrackIdentity(track(2, { kind: 'owned' }), { status: 'unminted' });
  assert.deepEqual(crossWired, { mint: 'unavailable', reason: 'conflict' });

  const mismatch = resolveTrackIdentity(track(3, { kind: 'owned' }), { status: 'minted', sac: 'CREAL', pool: 'CREALPOOL' });
  assert.ok(mismatch.mint === 'minted' && mismatch.d1Mismatch && mismatch.sac === 'CREAL');

  const partial = resolveTrackIdentity({ id: 'x', title: 'x', address: 'G', mintToken: 'C1', mintAmm: null });
  assert.deepEqual(partial, { mint: 'unavailable', reason: 'partialIndex' });
});

test('C-12: a pool below 99 KALE is excluded from the buy plan', () => {
  const t = track(1, { kind: 'available' });
  const identity = resolveTrackIdentity(t, { status: 'minted', sac: 'CSAC1', pool: 'CAMM1', kaleReserve: 980_000_000n });
  const plan = buildCollectPlan([{ track: t, identity, state: classifyTrack(identity, known(0n)) }]);
  assert.equal(plan.buy.length, 0);
  assert.equal(plan.excluded[0].reason, 'poolTooSmall');
});

test('pills pair an icon with a word for every state', () => {
  for (const state of ['owned', 'available', 'unminted', 'minting', 'buying', 'checking', 'unknown', 'unavailable'] as const) {
    const pill = describeTrackPill(state, { signedIn: true, balance: 2_360_000_000_000_000n });
    assert.ok(pill.label.length > 0);
  }
  assert.equal(describeTrackPill('owned', { signedIn: true, balance: 2_360_000_000_000_000n }).suffix, '236M');
});
