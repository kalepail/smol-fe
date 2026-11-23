/**
 * Mixtape collector model (Report 30 §4–§6).
 *
 * PURE: zero I/O, zero Stellar SDK imports. One classifier drives every
 * surface on /mixtapes/[id]: the CollectCard, the ownership bar, the per-track
 * pills and the CollectSheet. Safety rules encoded here:
 * - An RPC error is never "you own 0" (C-02): `error` holdings classify as
 *   `unknown` and are excluded from every plan.
 * - Minting makes you the owner (10,000,000 tokens to the minter): a track in
 *   `mint` is never also in `buy`.
 * - Songs without a creator Address, or with a partial/conflicting index, are
 *   `unavailable` and cost nothing (C-04).
 * - KALE totals are exact: 100 per mint, 33 per buy. No "~".
 */
import { fitsMaxIn } from './cometQuote.ts';
import {
  BUY_BATCH_SIZE,
  BUY_COST_KALE,
  BUY_COST_STROOPS,
  MINT_BATCH_SIZE,
  MINT_COST_KALE,
  STROOPS_PER_KALE,
  kaleToStroops,
} from './mixtapePricing.ts';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CollectTrackInput {
  id: string;
  title: string;
  address?: string | null;
  mintToken?: string | null;
  mintAmm?: string | null;
}

/** Per-track holder balance, tri-state + idle. `error` is NEVER coerced to 0n. */
export type Holding =
  | { status: 'idle' }
  | { status: 'loading'; cached?: bigint }
  | { status: 'known'; balance: bigint; checkedAt: number }
  | { status: 'error'; cached?: bigint; message: string };

/** What the chain said about this track's canonical (derived) identity. */
export type ChainFacts =
  | { status: 'unread' }
  /** The id can't be canonically derived: identity is unresolved, never trusted from D1. */
  | { status: 'underivable' }
  /** The chain read failed or was inconclusive: ownership AND mint status are unknown. */
  | { status: 'error' }
  | { status: 'unminted' }
  /** Unverifiable identity (legacy id, unaudited pool executable, server "unresolved"). */
  | { status: 'unresolved' }
  | { status: 'minted'; sac: string; pool: string; kaleReserve?: bigint };

export type UnavailableReason = 'noCreator' | 'partialIndex' | 'conflict';

export type TrackIdentity =
  | {
      mint: 'minted';
      sac: string;
      pool: string;
      source: 'chain' | 'd1';
      /** D1 pair differs from the verified on-chain pair (C-15 / Report 31). */
      d1Mismatch: boolean;
      /** Minted on chain but not yet indexed in D1. */
      unindexed: boolean;
      kaleReserve?: bigint;
    }
  | { mint: 'unminted'; source: 'chain' | 'd1' }
  /** Chain read failed: never fall back to D1 for a signed-in decision. */
  | { mint: 'unknown' }
  | { mint: 'unavailable'; reason: UnavailableReason };

export type PendingKind = 'mint' | 'buy';
/** `locked`: submitted with an unconfirmed outcome — never re-signed until reconciled. */
export type PendingMark = PendingKind | 'locked';

export type TrackCollectState =
  | 'owned'
  | 'available'
  | 'unminted'
  | 'minting'
  | 'buying'
  | 'checking'
  | 'unknown'
  | 'unavailable';

// ---------------------------------------------------------------------------
// Identity + classification
// ---------------------------------------------------------------------------

/**
 * Resolve the identity used for balance reads and checkout.
 * Order: no creator Address → unavailable (C-04, even if minted) · verified
 * chain facts · unresolved/underivable → unavailable · failed read → unknown ·
 * chain-unminted (a D1 pair there is cross-wired) · D1 only when unread.
 */
export function resolveTrackIdentity(
  track: CollectTrackInput,
  facts: ChainFacts = { status: 'unread' }
): TrackIdentity {
  const d1Token = track.mintToken || null;
  const d1Amm = track.mintAmm || null;

  if (!track.address) return { mint: 'unavailable', reason: 'noCreator' };

  switch (facts.status) {
    case 'minted':
      return {
        mint: 'minted',
        sac: facts.sac,
        pool: facts.pool,
        source: 'chain',
        d1Mismatch: Boolean((d1Token && d1Token !== facts.sac) || (d1Amm && d1Amm !== facts.pool)),
        unindexed: !d1Token && !d1Amm,
        kaleReserve: facts.kaleReserve,
      };
    case 'unresolved':
    case 'underivable':
      return { mint: 'unavailable', reason: 'conflict' };
    case 'error':
      return { mint: 'unknown' };
    case 'unminted':
      // D1 claims a pair but the canonical asset doesn't exist: the indexed pair
      // belongs to another song (Report 31). Never buy or mint on that basis.
      if (d1Token || d1Amm) return { mint: 'unavailable', reason: 'conflict' };
      return { mint: 'unminted', source: 'chain' };
    default:
      break;
  }

  if (d1Token && d1Amm) {
    return { mint: 'minted', sac: d1Token, pool: d1Amm, source: 'd1', d1Mismatch: false, unindexed: false };
  }
  if (d1Token || d1Amm) return { mint: 'unavailable', reason: 'partialIndex' };
  return { mint: 'unminted', source: 'd1' };
}

/**
 * Precedence: pending → unavailable → unknown (failed chain or holding read,
 * BEFORE any D1 fallback) → unminted → holding.
 * Signed out: only `available | unminted | unavailable` (ownership unknowable).
 */
export function classifyTrack(
  identity: TrackIdentity,
  holding: Holding,
  pending?: PendingMark | null,
  signedIn = true
): TrackCollectState {
  if (signedIn && pending) {
    if (pending === 'locked') return 'unknown';
    return pending === 'mint' ? 'minting' : 'buying';
  }
  if (identity.mint === 'unavailable') return 'unavailable';
  if (signedIn && (identity.mint === 'unknown' || holding.status === 'error')) return 'unknown';
  if (identity.mint === 'unknown') return 'unavailable';
  if (identity.mint === 'unminted') return 'unminted';
  if (!signedIn) return 'available';
  switch (holding.status) {
    case 'known':
      return holding.balance > 0n ? 'owned' : 'available';
    default:
      return 'checking';
  }
}

// ---------------------------------------------------------------------------
// Summary + page state
// ---------------------------------------------------------------------------

export interface CollectSummary {
  total: number;
  owned: number;
  available: number;
  unminted: number;
  minting: number;
  buying: number;
  checking: number;
  unknown: number;
  unavailable: number;
  /** total - unavailable */
  collectible: number;
  /** Every minted, collectible track has a known holding from the latest read. */
  fresh: boolean;
}

export function summarizeMixtape(states: TrackCollectState[]): CollectSummary {
  const s: CollectSummary = {
    total: states.length,
    owned: 0,
    available: 0,
    unminted: 0,
    minting: 0,
    buying: 0,
    checking: 0,
    unknown: 0,
    unavailable: 0,
    collectible: 0,
    fresh: true,
  };
  for (const state of states) s[state] += 1;
  s.collectible = s.total - s.unavailable;
  s.fresh = s.checking === 0 && s.unknown === 0;
  return s;
}

export type CollectPhase = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';
export type PageStateId = CollectPhase | 'S8' | 'S9';
export type KaleState =
  | { status: 'idle' }
  | { status: 'loading'; balance?: bigint }
  | { status: 'known'; balance: bigint; checkedAt: number }
  | { status: 'error'; balance?: bigint };

export interface PageState {
  /** Base phase (first match wins, Report 30 §4.2). */
  phase: CollectPhase;
  variant: 'a' | 'b' | 'c' | 'partial' | null;
  overlay: 'S8' | 'S9' | 'busy' | null;
  /** What the page shows: overlay S8/S9 when present, else the base phase. */
  state: PageStateId;
}

export function derivePageState(input: {
  signedIn: boolean;
  summary: CollectSummary;
  /** False until the first ownership read for this wallet + mixtape returns. */
  hydrated: boolean;
  kale: KaleState;
  plan: CollectPlan | null;
  flow: FlowKind;
}): PageState {
  const { signedIn, summary: s, hydrated, kale, plan, flow } = input;
  let phase: CollectPhase;
  let variant: PageState['variant'] = null;

  if (!signedIn) {
    phase = 'S0';
    const minted = s.collectible - s.unminted;
    variant = s.unminted === 0 ? 'a' : minted === 0 ? 'c' : 'b';
  } else if (s.unknown > 0) {
    phase = 'S7';
  } else if (!hydrated || s.checking > 0) {
    phase = 'S6';
  } else if (s.collectible > 0 && s.owned === s.collectible) {
    phase = 'S5';
    variant = s.unavailable > 0 ? 'partial' : null;
  } else if (s.owned === 0 && s.collectible > 0 && s.unminted === s.collectible) {
    phase = 'S4';
  } else if (s.owned === 0 && s.unminted === 0) {
    phase = 'S1';
  } else if (s.owned > 0 && s.unminted === 0) {
    phase = 'S2';
  } else {
    phase = 'S3';
  }

  let overlay: PageState['overlay'] = null;
  if (signedIn) {
    // S9 waits for the first ownership read so the bar and counts are real.
    if (flow === 'paused' && phase !== 'S6') overlay = 'S9';
    else if ((flow === 'running' || s.minting + s.buying > 0) && phase !== 'S6') overlay = 'busy';
    else if (
      plan &&
      plan.costStroops > 0n &&
      kale.status === 'known' &&
      kale.balance < plan.costStroops &&
      (phase === 'S1' || phase === 'S2' || phase === 'S3' || phase === 'S4' || phase === 'S7')
    ) {
      overlay = 'S8';
    }
  }

  const state: PageStateId = overlay === 'S8' || overlay === 'S9' ? overlay : phase;
  return { phase, variant, overlay, state };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface PlanTrack {
  id: string;
  title: string;
  creator?: string;
  sac?: string;
  pool?: string;
}

export type ExcludedReason = 'unknown' | 'unavailable' | 'pending' | 'poolTooSmall';

export interface PlanStep {
  id: string;
  kind: PendingKind;
  trackIds: string[];
  costStroops: bigint;
}

export interface CollectPlan {
  mint: PlanTrack[];
  buy: PlanTrack[];
  excluded: { id: string; title: string; reason: ExcludedReason }[];
  steps: PlanStep[];
  costKale: number;
  costStroops: bigint;
  signatures: number;
}

export interface PlanInputTrack {
  track: CollectTrackInput;
  identity: TrackIdentity;
  state: TrackCollectState;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function buildCollectPlan(
  rows: PlanInputTrack[],
  opts: { selection?: ReadonlySet<string> | null; buyAmountStroops?: bigint } = {}
): CollectPlan {
  const buyAmount = opts.buyAmountStroops ?? BUY_COST_STROOPS;
  const selection = opts.selection ?? null;
  const mint: PlanTrack[] = [];
  const buy: PlanTrack[] = [];
  const excluded: CollectPlan['excluded'] = [];
  const seen = new Set<string>();

  for (const { track, identity, state } of rows) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    if (state === 'owned') continue;
    const title = track.title || 'Untitled track';
    if (state === 'unknown' || state === 'checking') {
      excluded.push({ id: track.id, title, reason: 'unknown' });
      continue;
    }
    if (state === 'unavailable') {
      excluded.push({ id: track.id, title, reason: 'unavailable' });
      continue;
    }
    if (state === 'minting' || state === 'buying') {
      excluded.push({ id: track.id, title, reason: 'pending' });
      continue;
    }
    if (selection && !selection.has(track.id)) continue;

    if (state === 'unminted' && track.address) {
      mint.push({ id: track.id, title, creator: track.address });
    } else if (state === 'available' && identity.mint === 'minted') {
      if (
        identity.kaleReserve !== undefined &&
        !fitsMaxIn(identity.kaleReserve, buyAmount)
      ) {
        excluded.push({ id: track.id, title, reason: 'poolTooSmall' });
        continue;
      }
      buy.push({ id: track.id, title, sac: identity.sac, pool: identity.pool });
    }
  }

  const steps: PlanStep[] = [
    ...chunk(mint, MINT_BATCH_SIZE).map((group, i) => ({
      id: `mint-${i + 1}`,
      kind: 'mint' as const,
      trackIds: group.map((t) => t.id),
      costStroops: kaleToStroops(group.length * MINT_COST_KALE),
    })),
    ...chunk(buy, BUY_BATCH_SIZE).map((group, i) => ({
      id: `buy-${i + 1}`,
      kind: 'buy' as const,
      trackIds: group.map((t) => t.id),
      costStroops: buyAmount * BigInt(group.length),
    })),
  ];

  const costStroops =
    kaleToStroops(mint.length * MINT_COST_KALE) + buyAmount * BigInt(buy.length);
  return {
    mint,
    buy,
    excluded,
    steps,
    costKale: Number(costStroops / STROOPS_PER_KALE),
    costStroops,
    signatures: steps.length,
  };
}

/**
 * Largest selection affordable with `balance`, preferring 33-KALE buys over
 * 100-KALE mints, in tracklist order.
 */
export function affordableSubset(plan: CollectPlan, balance: bigint): Set<string> {
  const picked = new Set<string>();
  let left = balance;
  for (const t of plan.buy) {
    if (left < BUY_COST_STROOPS) break;
    picked.add(t.id);
    left -= BUY_COST_STROOPS;
  }
  const mintCost = kaleToStroops(MINT_COST_KALE);
  for (const t of plan.mint) {
    if (left < mintCost) break;
    picked.add(t.id);
    left -= mintCost;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Flow (resumable steps, S9)
// ---------------------------------------------------------------------------

export type StepStatus =
  | 'pending'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'done'
  | 'cancelled'
  | 'failed';

export type StepFailure =
  | 'cancelled'
  | 'poolTooSmall'
  | 'mintCollision'
  | 'rejected'
  | 'timeout'
  | 'uncertain'
  /** Reconciled: its signature expired on chain and it never landed. Safe to retry. */
  | 'expired'
  | 'auth'
  | 'network'
  | 'unknown';

export interface FlowStep {
  id: string;
  kind: PendingKind;
  trackIds: string[];
  titles: string[];
  costStroops: bigint;
  status: StepStatus;
  failure?: StepFailure;
  /** Epoch ms when the step was signed/submitted. */
  since?: number;
  /** Ledger after which this step's signed auth can never land (reconciliation bound). */
  expiresAtLedger?: number;
  /** Workflow ids returned by POST /mint (for POST /mint/status, Report 31). */
  workflowIds?: string[];
}

export type FlowKind = 'idle' | 'running' | 'paused' | 'done';

/** Outcomes that may have been charged and are not yet reconciled. */
export function isUnsettledFailure(step: FlowStep): boolean {
  return step.status === 'failed' && (step.failure === 'uncertain' || step.failure === 'timeout');
}

/** Submitted (or possibly submitted) steps: their songs are locked against re-signing. */
export function isLocked(step: FlowStep): boolean {
  return step.status === 'submitting' || step.status === 'confirming' || isUnsettledFailure(step);
}

export function flowKind(steps: FlowStep[]): FlowKind {
  if (steps.length === 0) return 'idle';
  if (steps.some((s) => s.status === 'signing' || s.status === 'submitting' || s.status === 'confirming')) {
    return 'running';
  }
  if (steps.every((s) => s.status === 'done')) return 'done';
  if (steps.some((s) => s.status === 'done' || s.status === 'cancelled' || s.status === 'failed')) {
    return 'paused';
  }
  return 'idle';
}

/**
 * Track id → pending mark. In-flight steps show Minting…/Buying…; unsettled
 * failures lock their songs (`locked` → unknown) so no plan can re-sign them.
 */
export function pendingByTrack(steps: FlowStep[]): Map<string, PendingMark> {
  const out = new Map<string, PendingMark>();
  for (const step of steps) {
    if (step.status === 'submitting' || step.status === 'confirming') {
      for (const id of step.trackIds) out.set(id, step.kind);
    } else if (isUnsettledFailure(step)) {
      for (const id of step.trackIds) if (!out.has(id)) out.set(id, 'locked');
    }
  }
  return out;
}

/** "Start over" keeps every submitted/unsettled step (and its lock); drops the rest. */
export function stepsForStartOver(steps: FlowStep[]): FlowStep[] {
  return steps.filter(isLocked);
}

/** Wall-clock bound for locks saved without an expiration ledger. */
export const LOCK_MAX_MS = 30 * 60 * 1000;

/**
 * Reconcile one submitted/unsettled step against a FRESH, successful chain read.
 * - every song now held → done;
 * - the signature's expiration ledger has passed (or the wall-clock bound for
 *   legacy records) and the songs still aren't held → `expired`: it can never
 *   land, so it was not charged and may be retried;
 * - otherwise unchanged (still locked).
 */
export function reconcileStep(
  step: FlowStep,
  read: { ok: boolean; ownedAll: boolean; latestLedger: number | null; now: number }
): FlowStep {
  if (!isLocked(step) || !read.ok) return step;
  if (read.ownedAll) return { ...step, status: 'done', failure: undefined };
  const expired =
    step.expiresAtLedger !== undefined
      ? read.latestLedger !== null && read.latestLedger > step.expiresAtLedger
      : step.since !== undefined && read.now - step.since > LOCK_MAX_MS;
  return expired ? { ...step, status: 'failed', failure: 'expired' } : step;
}

/**
 * Classify a step error by where it happened. Before the signature leaves the
 * device it is clean (cancel = not charged). After submission only a definite
 * 4xx refusal is clean; 5xx / 408 / 429 / transport errors are `uncertain`.
 */
export function classifySubmitFailure(input: {
  error: unknown;
  status?: number;
  phase: 'signing' | 'submitting';
}): StepFailure {
  const { error, status, phase } = input;
  if (phase === 'signing') {
    if (status === 401) return 'auth';
    return classifyStepError(error);
  }
  if (status === 401) return 'auth';
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return 'rejected';
  }
  return 'uncertain';
}

/** Signing guard: a step may only be built and signed with a KNOWN, SUFFICIENT KALE balance. */
export function kaleGuard(kale: KaleState, costStroops: bigint): 'ok' | 'unknown' | 'short' {
  if (kale.status !== 'known') return 'unknown';
  return kale.balance >= costStroops ? 'ok' : 'short';
}

export function stepsFromPlan(plan: CollectPlan, titles: ReadonlyMap<string, string>): FlowStep[] {
  return plan.steps.map((s) => ({
    id: s.id,
    kind: s.kind,
    trackIds: [...s.trackIds],
    titles: s.trackIds.map((id) => titles.get(id) ?? 'Untitled track'),
    costStroops: s.costStroops,
    status: 'pending',
  }));
}

/** Steps that a passkey tap may (re)run. Unsettled outcomes never re-sign. */
export function isRunnable(step: FlowStep): boolean {
  if (step.status === 'pending' || step.status === 'cancelled') return true;
  return step.status === 'failed' && !isUnsettledFailure(step);
}

export function runnableCount(steps: FlowStep[]): number {
  return steps.filter(isRunnable).length;
}

/** Next step a single passkey tap should run (D-C5: one tap per signature). */
export function nextRunnableStep(steps: FlowStep[]): FlowStep | null {
  return steps.find(isRunnable) ?? null;
}

export const FLOW_STORAGE_VERSION = 1;
export const FLOW_TTL_MS = 30 * 60 * 1000;

export function flowStorageKey(wallet: string, mixtapeId: string): string {
  return `smol:collect:v${FLOW_STORAGE_VERSION}:${wallet}:${mixtapeId}`;
}

export function serializeFlow(steps: FlowStep[], now: number): string {
  return JSON.stringify({
    v: FLOW_STORAGE_VERSION,
    updatedAt: now,
    steps: steps.map((s) => ({ ...s, costStroops: s.costStroops.toString() })),
  });
}

/**
 * Restore saved progress. Steps interrupted mid-signature were never signed
 * (→ cancelled). Steps interrupted after submission keep confirming and stay
 * locked until a fresh chain read reconciles them (owned → done, signature
 * expired → `expired`), so the UI never repeats a paid action on a guess.
 */
export function restoreFlow(raw: string | null, now: number): FlowStep[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data?.v !== FLOW_STORAGE_VERSION || typeof data.updatedAt !== 'number') return null;
    if (!Array.isArray(data.steps)) return null;
    const steps: FlowStep[] = data.steps.map((s: Record<string, unknown>) => {
      const status = s.status as StepStatus;
      const kind = s.kind as PendingKind;
      const base: FlowStep = {
        id: String(s.id),
        kind,
        trackIds: (s.trackIds as string[]).map(String),
        titles: ((s.titles as string[]) ?? []).map(String),
        costStroops: BigInt(String(s.costStroops ?? '0')),
        status,
        failure: s.failure as StepFailure | undefined,
        since: typeof s.since === 'number' ? s.since : undefined,
        expiresAtLedger: typeof s.expiresAtLedger === 'number' ? s.expiresAtLedger : undefined,
        workflowIds: Array.isArray(s.workflowIds) ? (s.workflowIds as unknown[]).map(String) : undefined,
      };
      if (status === 'signing') return { ...base, status: 'cancelled', failure: 'cancelled' };
      if (status === 'submitting' || status === 'confirming') {
        // Mints resolve from the chain poll; buys resolve from one balance re-read.
        return { ...base, status: 'confirming', since: base.since ?? now };
      }
      return base;
    });
    if (steps.length === 0 || steps.every((s) => s.status === 'done')) return null;
    // Expired records are dropped ONLY when nothing is locked: a submitted or
    // unsettled step persists until a fresh chain read reconciles it.
    if (now - data.updatedAt > FLOW_TTL_MS && !steps.some(isLocked)) return null;
    return steps;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Copy (Report 30 §5–§6). Exact strings; never "~" on KALE.
// ---------------------------------------------------------------------------

export function formatKale(kale: number): string {
  return `${kale.toLocaleString('en-US')} KALE`;
}

/** Exact stroop amount as KALE with trimmed decimals, e.g. 120.5 */
export function formatStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = (abs / STROOPS_PER_KALE).toLocaleString('en-US');
  const frac = (abs % STROOPS_PER_KALE).toString().padStart(7, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export const MINT_OWNS_COPY = 'Minting makes you the owner right away. No second purchase.';

export type CardAction =
  | 'signIn'
  | 'review'
  | 'continue'
  | 'holdings'
  | 'retryCheck'
  | 'collectChecked'
  | 'getKale'
  | 'affordable'
  | 'startOver'
  | 'openSheet'
  | 'none';

export interface CardCopy {
  title: string;
  tone: 'default' | 'success' | 'warning' | 'paused';
  subline: string;
  /** `owned` renders the ✓ Owned pill instead of a button. */
  primary: { label: string; action: CardAction; kind: 'primary' | 'secondary' | 'skeleton' | 'owned' };
  secondary?: { label: string; action: CardAction };
  note?: string;
  showExplainer: boolean;
}

function planLabel(plan: CollectPlan, phase: CollectPhase, summary: CollectSummary): string {
  const u = plan.mint.length;
  const m = plan.buy.length;
  const cost = formatKale(plan.costKale);
  if (phase === 'S1' && u === 0 && m > 1 && m === summary.available) return `Buy all ${m} · ${cost}`;
  if (phase === 'S2' && u === 0 && m === summary.available) return `Complete mixtape · ${cost}`;
  if (phase === 'S4' && m === 0 && u > 1 && u === summary.unminted) return `Mint all ${u} · ${cost}`;
  if (u > 0 && m > 0) return `Mint ${u} & buy ${m} · ${cost}`;
  if (u > 0) return `Mint ${u} · ${cost}`;
  return `Buy ${m} · ${cost}`;
}

function approvals(n: number): string {
  return `${n} passkey ${plural(n, 'approval')}`;
}

export function describeCollectCard(input: {
  page: PageState;
  summary: CollectSummary;
  plan: CollectPlan | null;
  kale: KaleState;
  steps: FlowStep[];
  checkFailures?: number;
  affordable?: { count: number; costKale: number; mints: number } | null;
}): CardCopy {
  const { page, summary: s, plan, kale, steps } = input;

  // Overlays first: they change the CTA, not the base phase.
  if (page.overlay === 'S9') {
    const done = steps.filter((x) => x.status === 'done').length;
    const left = runnableCount(steps);
    const unsettled = steps.filter(isUnsettledFailure).length;
    return {
      title: 'Collecting paused',
      tone: 'paused',
      // Never claim "nothing else was charged" while an outcome is unconfirmed.
      subline: unsettled
        ? `${done} of ${steps.length} ${plural(steps.length, 'step')} done. We're still confirming ${unsettled} — ${unsettled === 1 ? 'its songs' : 'their songs'} won't be charged again.`
        : `${done} of ${steps.length} ${plural(steps.length, 'step')} done. Nothing else was charged.`,
      primary:
        left > 0
          ? { label: `Continue · ${left} ${plural(left, 'approval')} left`, action: 'continue', kind: 'primary' }
          : { label: 'Check again', action: 'continue', kind: 'secondary' },
      secondary: { label: 'Start over', action: 'startOver' },
      showExplainer: false,
    };
  }
  if (page.overlay === 'busy') {
    const done = steps.filter((x) => x.status === 'done').length;
    const minting = s.minting;
    const buying = s.buying;
    const left = runnableCount(steps);
    const signing = steps.some((x) => x.status === 'signing');
    const base = describeBase(input);
    return {
      ...base,
      subline:
        minting > 0
          ? `Minting ${minting} on Stellar…`
          : buying > 0
            ? `Buying ${buying}…`
            : 'Waiting for your passkey…',
      // A confirming step never hides a cancelled/remaining one (C-05/S9).
      primary:
        left > 0 && !signing
          ? { label: `Continue · ${left} ${plural(left, 'approval')} left`, action: 'continue', kind: 'primary' }
          : {
              label: steps.length ? `Collecting… ${done} of ${steps.length} done` : 'Collecting…',
              action: 'openSheet',
              kind: 'secondary',
            },
      secondary: undefined,
      note: undefined,
    };
  }
  if (page.overlay === 'S8' && plan && kale.status === 'known') {
    const base = describeBase(input);
    const aff = input.affordable;
    return {
      ...base,
      tone: 'warning',
      subline: `You have ${formatStroops(kale.balance)} KALE. This needs ${formatStroops(plan.costStroops)}.`,
      primary: { label: 'Get KALE', action: 'getKale', kind: 'secondary' },
      secondary:
        aff && aff.count > 0
          ? {
              label: `${aff.mints > 0 ? (aff.mints === aff.count ? 'Mint' : 'Collect') : 'Buy'} ${aff.count} for ${formatKale(aff.costKale)} instead`,
              action: 'affordable',
            }
          : undefined,
      note: undefined,
    };
  }
  return describeBase(input);
}

function describeBase(input: {
  page: PageState;
  summary: CollectSummary;
  plan: CollectPlan | null;
  checkFailures?: number;
}): CardCopy {
  const { page, summary: s, plan } = input;
  const N = s.total;
  const signatures = plan?.signatures ?? 0;
  const songs = (n: number) => `${n} ${plural(n, 'song')}`;

  switch (page.phase) {
    case 'S0': {
      if (s.collectible === 0) {
        return {
          title: "These songs can't be collected yet",
          tone: 'default',
          subline: 'Check back once their creators finish setting them up.',
          primary: { label: 'Sign in to collect', action: 'signIn', kind: 'secondary' },
          showExplainer: false,
        };
      }
      if (page.variant === 'a') {
        return {
          title: `${songs(s.collectible)} you can collect`,
          tone: 'default',
          subline: `${BUY_COST_KALE} KALE a song · ${formatKale(s.collectible * BUY_COST_KALE)} for all ${s.collectible}`,
          primary: { label: 'Sign in to collect', action: 'signIn', kind: 'primary' },
          showExplainer: false,
        };
      }
      if (page.variant === 'c') {
        return {
          title: 'No songs minted yet',
          tone: 'default',
          subline: 'Be the first. Minting a song makes you its first owner.',
          primary: { label: 'Sign in to mint', action: 'signIn', kind: 'primary' },
          showExplainer: true,
        };
      }
      const minted = s.collectible - s.unminted;
      return {
        title: `${songs(s.collectible)} · ${minted} minted`,
        tone: 'default',
        subline: `Mint the other ${s.unminted} to own ${s.unminted === 1 ? 'it' : 'them'} first`,
        primary: { label: 'Sign in to collect', action: 'signIn', kind: 'primary' },
        showExplainer: true,
      };
    }
    case 'S6':
      return {
        title: 'Checking what you own…',
        tone: 'default',
        subline: 'Reading your wallet on Stellar',
        primary: { label: 'Checking…', action: 'none', kind: 'skeleton' },
        showExplainer: false,
      };
    case 'S7': {
      const n = plan ? plan.mint.length + plan.buy.length : 0;
      const busy = (input.checkFailures ?? 0) >= 3 ? ' Stellar might be busy. Try again in a minute.' : '';
      return {
        title: "Couldn't check what you own",
        tone: 'warning',
        subline: `To keep you from buying a song twice, buying is paused until we can check.${busy}`,
        primary: { label: 'Try again', action: 'retryCheck', kind: 'secondary' },
        // Only offer a partial collect when at least one read actually succeeded.
        secondary:
          n > 0 && s.owned + s.available > 0
            ? { label: `Collect the ${n} we could check`, action: 'collectChecked' }
            : undefined,
        showExplainer: false,
      };
    }
    case 'S5':
      if (page.variant === 'partial') {
        return {
          title: 'You own every song you can',
          tone: 'success',
          subline: `${s.unavailable} ${plural(s.unavailable, "song can't", "songs can't")} be collected yet`,
          primary: { label: `${s.owned} of ${N} owned`, action: 'none', kind: 'owned' },
          secondary: { label: 'See your songs', action: 'holdings' },
          showExplainer: false,
        };
      }
      return {
        title: 'You own this mixtape',
        tone: 'success',
        subline: `All ${songs(N)} are in your wallet`,
        primary: { label: 'Owned', action: 'none', kind: 'owned' },
        secondary: { label: 'See your songs', action: 'holdings' },
        showExplainer: false,
      };
    case 'S1':
      return {
        title: "You don't own any of these yet",
        tone: 'default',
        subline: s.unavailable
          ? `${s.available} ready to buy · ${s.unavailable} not available yet`
          : `All ${N} are minted and ready to buy`,
        primary: planPrimary(plan, page.phase, s),
        note: signatures ? approvals(signatures) : undefined,
        showExplainer: false,
      };
    case 'S2':
      return {
        title: `You own ${s.owned} of ${N}`,
        tone: 'default',
        subline: `${s.available} left to complete the mixtape`,
        primary: planPrimary(plan, page.phase, s),
        note: signatures ? approvals(signatures) : undefined,
        showExplainer: false,
      };
    case 'S4':
      return {
        title: 'None of these are minted yet',
        tone: 'default',
        subline: `Mint all ${s.unminted} to own the whole mixtape. You'll be each song's first owner.`,
        primary: planPrimary(plan, page.phase, s),
        note: "100 KALE each starts the song's market. You earn a share of every trade's fee.",
        showExplainer: true,
      };
    case 'S3':
    default: {
      const parts: string[] = [];
      if (s.available > 0) parts.push(`${s.available} ready to buy`);
      if (s.unminted > 0) parts.push(`${s.unminted} not minted yet`);
      return {
        title: s.owned > 0 ? `You own ${s.owned} of ${N}` : "You don't own any of these yet",
        tone: 'default',
        subline: parts.join(' · '),
        primary: planPrimary(plan, page.phase, s),
        note: MINT_OWNS_COPY,
        showExplainer: true,
      };
    }
  }
}

function planPrimary(
  plan: CollectPlan | null,
  phase: CollectPhase,
  s: CollectSummary
): CardCopy['primary'] {
  if (!plan || plan.steps.length === 0) {
    return { label: 'Nothing to collect right now', action: 'none', kind: 'secondary' };
  }
  return { label: planLabel(plan, phase, s), action: 'review', kind: 'primary' };
}

export interface PillCopy {
  label: string;
  /** Shown only at ≥ 640px (Not minted · 100) or ≥ 360px (balance). */
  suffix?: string;
  tone: 'success' | 'neutral' | 'accent' | 'warning' | 'muted';
  icon: 'check' | 'diamond' | 'ring' | 'spinner' | 'question' | 'none' | 'shimmer';
  dashed?: boolean;
}

export function abbreviateTokens(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_KALE;
  const units: [bigint, string][] = [
    [1_000_000_000_000n, 'T'],
    [1_000_000_000n, 'B'],
    [1_000_000n, 'M'],
    [1_000n, 'K'],
  ];
  for (const [div, suffix] of units) {
    if (whole >= div) {
      const tenths = (whole * 10n) / div;
      const int = tenths / 10n;
      const dec = tenths % 10n;
      return `${int}${int < 100n && dec > 0n ? `.${dec}` : ''}${suffix}`;
    }
  }
  return whole.toString();
}

export function describeTrackPill(
  state: TrackCollectState,
  opts: { balance?: bigint; signedIn: boolean }
): PillCopy {
  switch (state) {
    case 'owned':
      return {
        label: 'Owned',
        suffix: opts.balance && opts.balance > 0n ? abbreviateTokens(opts.balance) : undefined,
        tone: 'success',
        icon: 'check',
      };
    case 'available':
      return { label: `${BUY_COST_KALE} KALE`, tone: 'neutral', icon: 'diamond' };
    case 'unminted':
      return { label: 'Not minted', suffix: String(MINT_COST_KALE), tone: 'neutral', icon: 'ring', dashed: true };
    case 'minting':
      return { label: 'Minting…', tone: 'accent', icon: 'spinner' };
    case 'buying':
      return { label: 'Buying…', tone: 'accent', icon: 'spinner' };
    case 'checking':
      return { label: 'Checking', tone: 'muted', icon: 'shimmer' };
    case 'unknown':
      return { label: "Couldn't check", tone: 'warning', icon: 'question' };
    case 'unavailable':
    default:
      return { label: 'Not available yet', tone: 'muted', icon: 'none' };
  }
}

/** Plain step failure copy (Report 30 §6.8). Never raw transport text (C-13). */
export function describeStepFailure(failure: StepFailure | undefined, title?: string): string {
  switch (failure) {
    case 'cancelled':
      return "Cancelled. You weren't charged for this step.";
    case 'expired':
      return "This step didn't go through. You weren't charged.";
    case 'poolTooSmall':
      return `${title ? `“${title}”` : "A song"}'s market is too small to buy ${BUY_COST_KALE} KALE at once right now.`;
    case 'mintCollision':
      return `${title ? `“${title}”` : 'A song'} was minted by someone else a moment ago.`;
    case 'rejected':
      return "SMOL couldn't start this step. You weren't charged.";
    case 'timeout':
      return 'This is taking longer than usual. It may still finish. We’ll keep checking.';
    case 'uncertain':
      return 'We couldn’t confirm this step yet. These songs won’t be charged again until we know.';
    case 'auth':
      return 'Your session expired. Sign in to continue. Your progress is saved.';
    case 'network':
      return "Couldn't reach Stellar. Your progress is saved.";
    default:
      return "Something went wrong. You weren't charged for this step.";
  }
}

/** Map a thrown error to a plain failure kind. */
export function classifyStepError(error: unknown): StepFailure {
  const name = error instanceof Error ? error.name : '';
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (
    name === 'NotAllowedError' ||
    name === 'AbortError' ||
    message.includes('not allowed') ||
    message.includes('abort') ||
    message.includes('cancel')
  ) {
    return 'cancelled';
  }
  if (message.includes('401') || message.includes('unauthorized')) return 'auth';
  if (message.includes('ratio') || message.includes('max_in') || message.includes('maxin')) return 'poolTooSmall';
  if (message.includes('exist') || message.includes('collision') || message.includes('already')) {
    return 'mintCollision';
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('timeout')) {
    return 'network';
  }
  return 'unknown';
}
