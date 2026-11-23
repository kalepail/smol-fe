/**
 * One collect controller per mounted /mixtapes/[id] view (Report 30 §7.1).
 *
 * Static-import safe: this module imports only Svelte, pure utils and small
 * stores. Every Stellar read/sign/submit goes through dynamic import() so the
 * route's static closure never pulls the SDK, passkey-kit or smol-sdk.
 *
 * Guarantees:
 * - Ownership auto-loads after mount when signed in (B-19 / C-01) in ONE
 *   coalesced getLedgerEntries (or POST /chain/snapshot when enabled).
 * - Holdings are tri-state; an RPC error is `unknown`, never 0n (C-02).
 * - State is isolated per wallet + mixtape; late responses are dropped.
 * - One passkey tap per signature (D-C5), resumable progress in localStorage (S9).
 * - Buys never wait on mints (C-05); mints confirm via ONE poll loop (C-07),
 *   followed by ONE batched post-settlement refresh.
 */
import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
  affordableSubset,
  buildCollectPlan,
  classifySubmitFailure,
  classifyTrack,
  derivePageState,
  describeCollectCard,
  flowKind,
  flowStorageKey,
  isLocked,
  kaleGuard,
  nextRunnableStep,
  pendingByTrack,
  reconcileStep,
  resolveTrackIdentity,
  restoreFlow,
  serializeFlow,
  stepsForStartOver,
  acknowledgeSteps,
  mintPollTargets,
  isSigningElsewhere,
  ownsSigningClaim,
  expireForeignClaims,
  nextForeignClaimExpiry,
  parseServerSnapshot,
  SIGNING_LEASE_MS,
  stepsFromPlan,
  summarizeMixtape,
  type CardAction,
  type ChainFacts,
  type CollectTrackInput,
  type FlowStep,
  type Holding,
  type KaleState,
  type PlanInputTrack,
  type TrackCollectState,
} from '../utils/mixtapeOwnership';
import { fitsMaxIn } from '../utils/cometQuote';
import { BUY_COST_KALE, BUY_COST_STROOPS, MINT_COST_KALE, MINT_COST_STROOPS } from '../utils/mixtapePricing';
import { logger } from '../utils/logger';
import { e2eSeams } from '../utils/collectSeams';
import { userState } from './user.svelte';
import { setKnownKaleBalance } from './balance.svelte';
import { openAuthSheet } from './authSheet.svelte';
import { toast } from './toast.svelte';

export type CollectSheetView = 'review' | 'progress' | 'done' | 'holdings' | 'getKale' | 'explain';
export interface CollectNotice {
  tone: 'info' | 'warning';
  text: string;
}

const FRESH_MS = 60_000;
const MINT_CONFIRM_TIMEOUT_MS = 10 * 60_000;
const TOAST_TAG = 'mixtape-collect';

type SnapshotResult = {
  latestLedger: number | null;
  tracks: Map<string, { facts: ChainFacts; holding: Holding }>;
  kale: { status: 'known'; balance: bigint } | { status: 'error' } | null;
  errors: number;
};

/** Optional server snapshot (Report 31 `POST /chain/snapshot`), else null. */
async function readServerSnapshot(mixtapeId: string, signal?: AbortSignal): Promise<SnapshotResult | null> {
  if (import.meta.env.PUBLIC_CHAIN_SNAPSHOT !== '1' && !e2eSeams()?.serverSnapshot) return null;
  try {
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/chain/snapshot`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: { mixtapeId }, includeWallet: true }),
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    const parsed = parseServerSnapshot(body, import.meta.env.PUBLIC_KALE_SAC_ID, Date.now());
    if (!parsed) logger.warn('collect', 'Malformed server snapshot; using ledger reads');
    return parsed ? { latestLedger: null, ...parsed } : null;
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.warn('collect', 'Server snapshot unavailable; using ledger reads', error);
    return null;
  }
}

async function readSnapshot(input: {
  mixtapeId: string;
  tracks: CollectTrackInput[];
  holder: string;
  includeKale: boolean;
  serverFirst: boolean;
}): Promise<SnapshotResult> {
  if (input.serverFirst) {
    const server = await readServerSnapshot(input.mixtapeId);
    if (server) return server;
  }
  const { readMixtapeChainSnapshot } = await import('../utils/smolChainIdentity');
  return readMixtapeChainSnapshot({
    tracks: input.tracks.map((t) => ({ id: t.id, mintToken: t.mintToken, mintAmm: t.mintAmm })),
    holder: input.holder,
    includeKale: input.includeKale,
  });
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True only when the write succeeded AND reads back identically. */
function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return localStorage.getItem(key) === value;
  } catch {
    return false; // e.g. QuotaExceededError or storage disabled
  }
}

/** Per-tab identity for signing claims and the storage-lease fallback lock. */
const TAB_ID = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
})();
const STORAGE_LEASE_MS = 15_000;
/**
 * Web Locks hand off between tabs immediately, but Chromium propagates
 * localStorage between renderer processes asynchronously. Holding the lock
 * briefly after our last write lets the next holder's in-lock re-read see it.
 */
const LOCK_RELEASE_GRACE_MS = 150;

type StorageLease = { stillHeld: () => boolean; release: () => void };

/**
 * Cross-tab mutex over localStorage, used only when Web Locks are missing:
 * claim if free or expired, wait, then verify our claim survived concurrent
 * writers. Refreshed while held. `busy` / `unavailable` both fail closed.
 */
async function acquireStorageLease(key: string): Promise<StorageLease | 'busy' | 'unavailable'> {
  const read = (): { owner?: string; expiresAt?: number } | null => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  const current = read();
  if (current?.owner && current.owner !== TAB_ID && (current.expiresAt ?? 0) > Date.now()) return 'busy';
  const claim = () => writeStorage(key, JSON.stringify({ owner: TAB_ID, expiresAt: Date.now() + STORAGE_LEASE_MS }));
  if (!claim()) return 'unavailable';
  await new Promise((r) => setTimeout(r, 60));
  if (read()?.owner !== TAB_ID) return 'busy';
  const stillHeld = () => {
    const lease = read();
    return lease?.owner === TAB_ID && (lease.expiresAt ?? 0) > Date.now();
  };
  const timer = setInterval(() => {
    if (stillHeld()) claim();
  }, STORAGE_LEASE_MS / 3);
  return {
    stillHeld,
    release: () => {
      clearInterval(timer);
      if (read()?.owner === TAB_ID) writeStorage(key, null);
    },
  };
}

/** Thrown by the pre-relay guard: the signed payload is discarded, never relayed. */
class SubmitGuardError extends Error {
  readonly reason: 'stale' | 'unsaved';
  constructor(reason: 'stale' | 'unsaved') {
    super(reason === 'stale' ? 'Signing claim taken over by another tab' : 'Could not save submitting state');
    this.name = 'SubmitGuardError';
    this.reason = reason;
  }
}

function newAttemptId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `att-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
}

type ConfirmIntent =
  | { source: 'review'; key: string; cost: bigint }
  | { source: 'step'; stepId: string; key: string; cost: bigint };

const stepKey = (s: Pick<FlowStep, 'kind' | 'trackIds'>) => `${s.kind}:${s.trackIds.join(',')}`;

export function createCollectController(opts: {
  getMixtapeId: () => string;
  getMixtapeTitle: () => string;
  getTracks: () => CollectTrackInput[];
  /** True once tracks are loaded for the current mixtape. */
  isReady: () => boolean;
}) {
  const holdings = new SvelteMap<string, Holding>();
  const facts = new SvelteMap<string, ChainFacts>();
  let kale = $state<KaleState>({ status: 'idle' });
  let hydrated = $state(false);
  let refreshing = $state(false);
  let checkFailures = $state(0);
  let lastCheckedAt = $state(0);
  let steps = $state<FlowStep[]>([]);
  let selection = $state<Set<string> | null>(null);
  let sheetOpen = $state(false);
  let view = $state<CollectSheetView>('review');
  let notices = $state<CollectNotice[]>([]);
  let approving = $state(false);
  let doneSummary = $state<{ owned: number; total: number; added: number } | null>(null);

  let contextKey = '';
  let generation = 0;
  let resumeIntent = false;
  let pollAbort: AbortController | null = null;
  let refreshPromise: Promise<void> | null = null;
  let refreshAgain = false;
  const settledMintIds = new Set<string>();

  const signedIn = $derived(Boolean(userState.contractId));
  const tracks = $derived(opts.getTracks());
  const pending = $derived(pendingByTrack(steps));
  const rows = $derived<PlanInputTrack[]>(
    tracks.map((track) => {
      const identity = resolveTrackIdentity(track, facts.get(track.id));
      const state = classifyTrack(
        identity,
        holdings.get(track.id) ?? { status: 'idle' },
        pending.get(track.id) ?? null,
        signedIn
      );
      return { track, identity, state };
    })
  );
  const states = $derived<TrackCollectState[]>(rows.map((r) => r.state));
  const balances = $derived(
    tracks.map((t) => {
      const h = holdings.get(t.id);
      return h?.status === 'known' ? h.balance : undefined;
    })
  );
  const summary = $derived(summarizeMixtape(states));
  const fullPlan = $derived(signedIn ? buildCollectPlan(rows) : null);
  const plan = $derived(signedIn ? buildCollectPlan(rows, { selection }) : null);
  const kind = $derived(flowKind(steps));
  const page = $derived(
    derivePageState({ signedIn, summary, hydrated, kale, plan: fullPlan, flow: kind })
  );
  const affordable = $derived.by(() => {
    if (!fullPlan || kale.status !== 'known') return null;
    const subset = affordableSubset(fullPlan, kale.balance);
    const mints = fullPlan.mint.filter((t) => subset.has(t.id)).length;
    const buys = fullPlan.buy.filter((t) => subset.has(t.id)).length;
    return { subset, count: subset.size, mints, costKale: mints * MINT_COST_KALE + buys * BUY_COST_KALE };
  });
  const card = $derived(
    describeCollectCard({ page, summary, plan: fullPlan, kale, steps, checkFailures, affordable })
  );
  const titles = $derived(new Map(tracks.map((t) => [t.id, t.title || 'Untitled track'])));

  // -------------------------------------------------------------------------
  // Context (wallet + mixtape) lifecycle
  // -------------------------------------------------------------------------

  function storageKey(): string | null {
    const wallet = userState.contractId;
    return wallet ? flowStorageKey(wallet, opts.getMixtapeId()) : null;
  }

  /** Persist shared progress. Returns false when it could not be saved durably. */
  function persist(): boolean {
    const key = storageKey();
    if (!key) return false;
    const k = flowKind(steps);
    return writeStorage(key, steps.length && k !== 'done' ? serializeFlow(steps, Date.now()) : null);
  }

  function setSteps(next: FlowStep[]): boolean {
    steps = next;
    return persist();
  }

  /**
   * Shared progress for this wallet + mixtape as other tabs last wrote it.
   * `live` keeps in-flight statuses as written (another tab may be signing);
   * inside the cross-tab lock nobody else can be signing, so in-flight statuses
   * left behind by a closed tab are normalised like a reload.
   */
  function readSharedSteps(live: boolean): FlowStep[] | null {
    const key = storageKey();
    return key ? restoreFlow(readStorage(key), Date.now(), { live, tabId: TAB_ID }) : null;
  }

  /**
   * THE single write path for an existing step (update, replace or delete).
   * Re-reads shared progress and writes ONLY if the stored step still matches
   * what this code path last saw: same attempt, same owner (when given), and an
   * expected status. Otherwise another tab (or a newer attempt) owns the record:
   * reload it for display and write/delete NOTHING.
   */
  /**
   * Compared against the RAW stored record (never the normalised in-memory view,
   * where an expired `signing` reads as `cancelled` and `submitting` as `confirming`).
   */
  type StepGuard = {
    attemptId: string | undefined;
    /** When set, the stored owner must equal `owner.id` exactly (incl. undefined). */
    owner?: { id: string | undefined };
    /** Raw stored statuses accepted. */
    statuses: FlowStep['status'][];
    /** A raw `signing` record is only matched once its lease has expired (reclaim). */
    expiredSigningOnly?: boolean;
    trackKey?: string;
    workflowKey?: string;
  };

  const workflowKeyOf = (s: FlowStep) => (s.workflowIds ?? []).join(',');

  /** Exact guard for a stored step as it is RIGHT NOW (captured synchronously). */
  function captureGuard(stepId: string, statuses?: FlowStep['status'][]): StepGuard | null {
    const raw = readSharedSteps(true)?.find((s) => s.id === stepId);
    if (!raw) return null;
    return {
      attemptId: raw.attemptId,
      owner: { id: raw.ownerTabId },
      statuses: statuses ?? [raw.status],
      expiredSigningOnly: true,
      trackKey: raw.trackIds.join(','),
      workflowKey: workflowKeyOf(raw),
    };
  }

  function writeIfStill(
    stepId: string,
    guard: StepGuard,
    mutate: (shared: FlowStep[]) => FlowStep[]
  ): 'ok' | 'lost' | 'unsaved' {
    const shared = readSharedSteps(true) ?? [];
    const stored = shared.find((s) => s.id === stepId);
    if (
      !stored ||
      stored.attemptId !== guard.attemptId ||
      (guard.owner !== undefined && stored.ownerTabId !== guard.owner.id) ||
      !guard.statuses.includes(stored.status) ||
      (guard.expiredSigningOnly && stored.status === 'signing' && (stored.leaseExpiresAt ?? 0) > Date.now()) ||
      (guard.trackKey !== undefined && stored.trackIds.join(',') !== guard.trackKey) ||
      (guard.workflowKey !== undefined && workflowKeyOf(stored) !== guard.workflowKey)
    ) {
      steps = shared;
      return 'lost';
    }
    return setSteps(mutate(shared)) ? 'ok' : 'unsaved';
  }

  const patchIn = (id: string, patch: Partial<FlowStep>) => (shared: FlowStep[]) =>
    shared.map((s) => (s.id === id ? { ...s, ...patch } : s));
  const removeIn = (id: string) => (shared: FlowStep[]) => shared.filter((s) => s.id !== id);

  /** A guard that never matches (nothing to write). */
  const NO_MATCH: StepGuard = { attemptId: '\u0000none', statuses: [] };

  /** Clear finished progress, but never delete another tab's newer record. */
  function clearIfDone() {
    const shared = readSharedSteps(true);
    if (!shared || flowKind(shared) === 'done') setSteps([]);
    else steps = shared;
  }

  /**
   * Serialize every progress-mutating action (approve, start over, acknowledge)
   * across tabs for this wallet + mixtape. Inside the lock the shared progress is
   * re-read before anything is written or signed, so a second tab can never
   * overwrite another tab's submitted/uncertain lock or submit a duplicate buy.
   */
  let activeLease: StorageLease | null = null;
  let holdingWebLock = false;

  async function withCollectLock<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    const name = `smol-collect:${userState.contractId ?? ''}:${opts.getMixtapeId()}`;
    const run = async () => {
      const shared = readSharedSteps(false);
      steps = shared ?? [];
      return fn();
    };
    if (locks?.request) {
      return locks.request(name, { mode: 'exclusive' }, async () => {
        holdingWebLock = true;
        try {
          return await run();
        } finally {
          holdingWebLock = false;
          await new Promise((r) => setTimeout(r, LOCK_RELEASE_GRACE_MS));
        }
      }) as Promise<T>;
    }

    // No Web Locks: require the storage lease, else fail closed (nothing is signed).
    const lease = await acquireStorageLease(`smol:collect-lock:v1:${userState.contractId ?? ''}:${opts.getMixtapeId()}`);
    if (lease === 'busy' || lease === 'unavailable') {
      notices = [
        ...notices,
        {
          tone: 'warning',
          text:
            lease === 'busy'
              ? 'Another tab is completing this purchase. Finish it there, then try again.'
              : "This browser window can't safely coordinate purchases across tabs, so nothing was signed.",
        },
      ];
      return undefined;
    }
    activeLease = lease;
    try {
      return await run();
    } finally {
      activeLease = null;
      await new Promise((r) => setTimeout(r, LOCK_RELEASE_GRACE_MS));
      lease.release();
    }
  }

  /** Durable-save failure before a signature: abort, never sign unrecorded. */
  function abortUnsaved(stepId: string, revertTo: FlowStep['status'], afterPasskey = false) {
    steps = steps.map((s) =>
      s.id === stepId ? { ...s, status: revertTo, ownerTabId: undefined, leaseExpiresAt: undefined } : s
    );
    const text = afterPasskey
      ? "Couldn't save your progress in this browser, so nothing was sent and you weren't charged. Free up browser storage and try again."
      : "Couldn't save your progress in this browser, so nothing was signed. Free up browser storage and try again.";
    notices = [...notices, { tone: 'warning', text }];
    toast.error(text, { tag: TOAST_TAG });
  }

  function resetContext() {
    generation++;
    pollAbort?.abort();
    pollAbort = null;
    holdings.clear();
    facts.clear();
    settledMintIds.clear();
    kale = { status: 'idle' };
    hydrated = false;
    refreshing = false;
    checkFailures = 0;
    lastCheckedAt = 0;
    steps = [];
    selection = null;
    notices = [];
    doneSummary = null;
    sheetOpen = false;
    view = 'review';
  }

  $effect(() => {
    const wallet = userState.contractId;
    const mixtapeId = opts.getMixtapeId();
    const ready = opts.isReady();
    untrack(() => {
      const key = `${wallet ?? ''}|${mixtapeId}`;
      if (key !== contextKey) {
        // Wallet or mixtape switch: isolate state. `resumeIntent` survives a
        // signed-out → signed-in transition so the collect flow resumes (C-14).
        contextKey = key;
        resetContext();
        if (wallet) {
          const restored = restoreFlow(readStorage(flowStorageKey(wallet, mixtapeId)), Date.now(), { tabId: TAB_ID });
          if (restored) steps = restored;
        }
      }
      if (wallet && ready && !hydrated && !refreshing) {
        // After first paint: the dynamic import keeps the SDK off the route closure.
        const gen = generation;
        requestAnimationFrame(() => {
          if (gen !== generation) return;
          void refresh().then(() => {
            if (gen !== generation) return;
            resumeConfirming();
            maybeResumeIntent();
          });
        });
      }
    });
  });

  $effect(() => {
    return () => {
      generation++;
      pollAbort?.abort();
    };
  });

  /**
   * Another tab's signing claim expired (tab closed or frozen mid-passkey):
   * show its step as cancelled so this tab can offer Continue without a reload.
   * View-only (no write); the next locked action re-reads and persists.
   */
  function recheckForeignClaims() {
    if (approving) return;
    const base = readSharedSteps(true) ?? steps;
    const next = expireForeignClaims(base, TAB_ID, Date.now());
    if (next !== steps) steps = next;
  }

  $effect(() => {
    const expiry = nextForeignClaimExpiry(steps, TAB_ID, Date.now());
    if (expiry === null) return;
    const timer = setTimeout(() => recheckForeignClaims(), Math.max(0, expiry - Date.now()) + 100);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheckForeignClaims();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  // Another tab wrote progress for this wallet + mixtape: reflect it at once
  // (its submitted/uncertain locks exclude those songs from our plan).
  $effect(() => {
    const onStorage = (event: StorageEvent) => {
      const key = storageKey();
      if (!key || event.key !== key) return;
      steps = (event.newValue ? restoreFlow(event.newValue, Date.now(), { live: true, tabId: TAB_ID }) : null) ?? [];
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async function refresh(opts2: { ids?: string[]; markLoading?: boolean } = {}): Promise<void> {
    if (refreshPromise) {
      refreshAgain = true;
      return refreshPromise;
    }
    refreshPromise = (async () => {
      let o = opts2;
      do {
        refreshAgain = false;
        await refreshOnce(o);
        // A request that arrived mid-flight gets one full, quiet re-read.
        o = { markLoading: false };
      } while (refreshAgain);
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  async function refreshOnce(o: { ids?: string[]; markLoading?: boolean }) {
    const holder = userState.contractId;
    if (!holder) return;
    const gen = generation;
    const all = untrack(() => tracks);
    const subset = o.ids ? all.filter((t) => o.ids!.includes(t.id)) : all;
    refreshing = true;
    if (o.markLoading !== false) {
      for (const t of subset) {
        const prev = holdings.get(t.id);
        if (!prev || prev.status !== 'known') {
          holdings.set(t.id, { status: 'loading', cached: prev?.status === 'error' ? prev.cached : undefined });
        }
      }
      if (kale.status !== 'known') kale = { status: 'loading' };
    }
    try {
      const snap = await readSnapshot({
        mixtapeId: opts.getMixtapeId(),
        tracks: subset,
        holder,
        includeKale: true,
        serverFirst: !o.ids,
      });
      if (gen !== generation || holder !== userState.contractId) return; // late response
      applySnapshot(snap, subset.map((t) => t.id));
      checkFailures = snap.errors > 0 ? checkFailures + 1 : 0;
    } catch (error) {
      if (gen !== generation) return;
      logger.error('collect', 'Ownership check failed', error);
      for (const t of subset) {
        // A failed read makes mint status unknown too: never fall back to D1 ("unminted").
        facts.set(t.id, { status: 'error' });
        const prev = holdings.get(t.id);
        holdings.set(t.id, {
          status: 'error',
          message: 'Ownership check failed',
          cached: prev?.status === 'known' ? prev.balance : undefined,
        });
      }
      if (kale.status !== 'known') kale = { status: 'error' };
      checkFailures++;
    } finally {
      if (gen === generation) {
        hydrated = true;
        refreshing = false;
      }
    }
  }

  function applySnapshot(snap: SnapshotResult, ids: string[]) {
    const now = Date.now();
    for (const id of ids) {
      const read = snap.tracks.get(id);
      if (!read) continue;
      facts.set(id, read.facts);
      holdings.set(id, read.holding);
    }
    if (snap.kale?.status === 'known') {
      kale = { status: 'known', balance: snap.kale.balance, checkedAt: now };
      if (userState.contractId) setKnownKaleBalance(userState.contractId, snap.kale.balance);
    } else if (snap.kale?.status === 'error') {
      kale = { status: 'error' };
    }
    lastCheckedAt = now;
  }

  async function refreshKale() {
    const holder = userState.contractId;
    if (!holder) return;
    const gen = generation;
    kale = { status: 'loading', balance: kale.status === 'known' ? kale.balance : undefined };
    try {
      const { readMixtapeChainSnapshot } = await import('../utils/smolChainIdentity');
      const snap = await readMixtapeChainSnapshot({ tracks: [], holder, includeKale: true });
      if (gen !== generation) return;
      applySnapshot({ ...snap, tracks: new Map() }, []);
    } catch {
      if (gen === generation) kale = { status: 'error' };
    }
  }

  // -------------------------------------------------------------------------
  // Sheet + intents
  // -------------------------------------------------------------------------

  function maybeResumeIntent() {
    if (!resumeIntent) return;
    resumeIntent = false;
    const phase = page.phase;
    if (phase === 'S5') {
      toast.success('You already own every song here.', { tag: TOAST_TAG });
    } else if (phase === 'S1' || phase === 'S2' || phase === 'S3' || phase === 'S4') {
      openReview();
    }
  }

  function openReview(sel: Set<string> | null = null) {
    selection = sel;
    notices = [];
    doneSummary = null;
    if (kind === 'done') clearIfDone();
    view = kind === 'running' || kind === 'paused' ? 'progress' : 'review';
    sheetOpen = true;
    if (Date.now() - lastCheckedAt > FRESH_MS) void refresh({ markLoading: false });
  }

  function onCardAction(action: CardAction) {
    switch (action) {
      case 'signIn':
        resumeIntent = true;
        openAuthSheet('signin', 'Sign in to collect songs from this mixtape.');
        break;
      case 'review':
      case 'collectChecked':
        openReview();
        break;
      case 'continue':
        view = 'progress';
        sheetOpen = true;
        void approveNext('step');
        break;
      case 'holdings':
        view = 'holdings';
        sheetOpen = true;
        break;
      case 'retryCheck':
        void refresh();
        break;
      case 'getKale':
        view = 'getKale';
        sheetOpen = true;
        break;
      case 'affordable':
        if (affordable) openReview(new Set(affordable.subset));
        break;
      case 'startOver':
        startOver();
        break;
      case 'acknowledge':
        acknowledge();
        break;
      case 'openSheet':
        recheckForeignClaims();
        view = 'progress';
        sheetOpen = true;
        break;
      default:
        break;
    }
  }

  function openView(next: CollectSheetView) {
    recheckForeignClaims();
    view = next;
    sheetOpen = true;
  }

  function toggleTrack(id: string) {
    const base = selection ?? new Set(fullPlan ? [...fullPlan.mint, ...fullPlan.buy].map((t) => t.id) : []);
    const next = new Set(base);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection = next;
  }

  function selectAffordable() {
    if (affordable) selection = new Set(affordable.subset);
  }

  function closeSheet() {
    sheetOpen = false;
    if (kind === 'done') {
      clearIfDone();
      doneSummary = null;
    }
  }

  function startOver() {
    // Submitted / unsettled steps keep their lock: their songs can't be re-signed
    // until a fresh chain read reconciles them or the user acknowledges them.
    void withCollectLock(async () => {
      setSteps(stepsForStartOver(steps));
      notices = [];
      doneSummary = null;
      selection = null;
      await refresh();
      await reconcileLocked();
      view = steps.length ? 'progress' : 'review';
      sheetOpen = true;
    });
  }

  /**
   * Explicit recovery for unsettled steps whose outcome can't be confirmed
   * (signature expired without a receipt, or a legacy record without expiry).
   * We never claim they weren't charged: the user checks holdings and chooses
   * to start a NEW purchase from a fresh read.
   */
  function acknowledge() {
    void withCollectLock(async () => {
      setSteps(acknowledgeSteps(steps, Date.now()));
      notices = [];
      doneSummary = null;
      selection = null;
      await refresh();
      view = 'review';
      sheetOpen = true;
    });
  }

  // -------------------------------------------------------------------------
  // Execution: one passkey tap per step
  // -------------------------------------------------------------------------

  /**
   * Run ONE step for exactly what the user is looking at. `review` = the
   * Review sheet's plan (songs + total); `step` = the displayed next step
   * (Continue / Approve step i). The intent is captured at click time and
   * re-checked under the cross-tab lock: if shared progress changed, nothing is
   * signed and the user confirms again.
   */
  async function approveNext(source: 'review' | 'step' = 'step'): Promise<void> {
    if (approving) return;
    const holder = userState.contractId;
    const keyId = userState.keyId;
    if (!holder || !keyId) {
      resumeIntent = true;
      openAuthSheet('signin', 'Sign in to collect songs from this mixtape.');
      return;
    }
    const gen = generation;
    let intent: ConfirmIntent;
    if (source === 'review') {
      const p = plan;
      intent = { source, key: planKey(p), cost: p?.costStroops ?? 0n };
    } else {
      const st = nextRunnableStep(steps);
      intent = { source, stepId: st?.id ?? '', key: st ? stepKey(st) : '', cost: st?.costStroops ?? 0n };
    }
    approving = true;
    try {
      await withCollectLock(() => approveNextLocked(holder, keyId, gen, intent));
    } finally {
      if (gen === generation) approving = false;
    }
  }

  function planKey(p: typeof plan): string {
    return p ? p.steps.map(stepKey).join('|') : '';
  }

  function requireReconfirm(text: string) {
    notices = [...notices, { tone: 'warning', text }];
    view = steps.length ? 'progress' : 'review';
    sheetOpen = true;
  }

  async function approveNextLocked(holder: string, keyId: string, gen: number, intent: ConfirmIntent): Promise<void> {
    if (gen !== generation) return;
    if (flowKind(steps) === 'done') setSteps([]);

    const now = Date.now();
    if (steps.some((s) => isSigningElsewhere(s, TAB_ID, now))) {
      requireReconfirm('Another tab is completing this purchase. Finish it there, then try again.');
      return;
    }

    let step = nextRunnableStep(steps);
    if (step && (intent.source === 'review' || step.id !== intent.stepId || stepKey(step) !== intent.key || step.costStroops !== intent.cost)) {
      // The step that would run is not what the user confirmed (e.g. another
      // tab left a cancelled 8-song step while this tab showed 1 song).
      requireReconfirm('This purchase changed in another tab. Check the step below and approve it again.');
      return;
    }
    if (!step) {
      // Unsettled outcomes are re-checked, never re-signed.
      if (steps.some((s) => s.status === 'failed')) {
        await reconcileLocked();
        if (steps.some(isLocked)) {
          requireReconfirm(
            "An earlier purchase for this mixtape isn't confirmed yet, so nothing new was signed. Its songs won't be charged again."
          );
        }
        return;
      }
      if (intent.source !== 'review') return; // Continue never starts a new purchase.
      const p = plan;
      if (!p || p.steps.length === 0) return;
      if (planKey(p) !== intent.key || p.costStroops !== intent.cost) {
        requireReconfirm('This purchase changed in another tab. Review the updated total and confirm again.');
        return;
      }
      if (kaleGuard(kale, p.costStroops) !== 'ok') return;
      const suffix = steps.length ? `-${Date.now().toString(36)}` : '';
      const added = stepsFromPlan(p, titles).map((s) => ({ ...s, id: `${s.id}${suffix}` }));
      // Safe: synchronous with the in-lock re-read above (no await in between).
      const before = steps;
      if (!setSteps([...steps, ...added])) {
        steps = before;
        abortUnsaved('', 'pending');
        return;
      }
      notices = [];
      view = 'progress';
      step = added[0];
    }

    const resumeStatus = step.status;
    // Claim the step for THIS tab + attempt and persist the claim before any signature.
    const attemptId = newAttemptId();
    // Compare-and-set against the exact RAW stored step (attempt, owner, status;
    // a persisted `signing` only once its lease has expired), read just now.
    const claimGuard = captureGuard(step.id) ?? NO_MATCH;
    const claimed = writeIfStill(
      step.id,
      claimGuard,
      patchIn(step.id, {
        status: 'signing',
        failure: undefined,
        ownerTabId: TAB_ID,
        attemptId,
        leaseExpiresAt: Date.now() + SIGNING_LEASE_MS,
        // A retry is a new attempt: drop the previous attempt's receipt so no
        // tab can poll the old workflow against it.
        workflowIds: undefined,
        expiresAtLedger: undefined,
        since: undefined,
      })
    );
    if (claimed !== 'ok') {
      if (claimed === 'lost') requireReconfirm('This purchase changed in another tab. Check the step below and approve it again.');
      else abortUnsaved(step.id, resumeStatus);
      return;
    }
    const signingStepId = step.id;
    // Every later write for this attempt must still find OUR attempt in the record.
    let phase: 'signing' | 'submitting' | 'confirming' = 'signing';
    const mine = (): StepGuard => ({ attemptId, owner: { id: TAB_ID }, statuses: [phase] });
    // Heartbeat: only ever refreshes OUR live claim; never resurrects a taken-over step.
    const leaseTimer = setInterval(() => {
      if (phase === 'signing') {
        writeIfStill(signingStepId, mine(), patchIn(signingStepId, { leaseExpiresAt: Date.now() + SIGNING_LEASE_MS }));
      }
    }, SIGNING_LEASE_MS / 4);
    try {
      // Pre-flight (C-15, freshness): re-read exactly this step's songs + KALE.
      const stepTracks = untrack(() => tracks).filter((t) => step.trackIds.includes(t.id));
      const snap = await readSnapshot({
        mixtapeId: opts.getMixtapeId(),
        tracks: stepTracks,
        holder,
        includeKale: true,
        serverFirst: false,
      });
      if (gen !== generation) return;
      applySnapshot(snap, stepTracks.map((t) => t.id));

      const keep: string[] = [];
      const moveToBuy: string[] = [];
      const next: CollectNotice[] = [];
      for (const t of stepTracks) {
        const identity = resolveTrackIdentity(t, facts.get(t.id));
        const state = classifyTrack(identity, holdings.get(t.id) ?? { status: 'idle' }, null, true);
        const title = t.title || 'Untitled track';
        if (state === 'owned') {
          next.push({ tone: 'info', text: `You already own “${title}”. Removed it from this purchase.` });
        } else if (step.kind === 'mint' && state === 'unminted') {
          keep.push(t.id);
        } else if (step.kind === 'mint' && state === 'available') {
          moveToBuy.push(t.id);
          next.push({ tone: 'info', text: `“${title}” was just minted by someone else. It's now ready to buy for ${BUY_COST_KALE} KALE.` });
        } else if (step.kind === 'buy' && state === 'available') {
          if (identity.mint === 'minted' && identity.kaleReserve !== undefined && !fitsMaxIn(identity.kaleReserve, BUY_COST_STROOPS)) {
            next.push({ tone: 'warning', text: `“${title}”'s market is too small to buy ${BUY_COST_KALE} KALE at once right now. Removed it.` });
          } else {
            keep.push(t.id);
          }
        } else if (state === 'unknown') {
          next.push({ tone: 'warning', text: `We couldn't check “${title}”. Removed it so you're never charged twice.` });
        } else {
          next.push({ tone: 'warning', text: `“${title}” isn't available right now. Removed it.` });
        }
      }
      notices = [...notices, ...next];

      const unitCost = step.kind === 'mint' ? MINT_COST_STROOPS : BUY_COST_STROOPS;
      const narrowed: Partial<FlowStep> = {
        trackIds: keep,
        titles: keep.map((id) => titles.get(id) ?? 'Untitled track'),
        costStroops: unitCost * BigInt(keep.length),
      };
      const extra: FlowStep[] = moveToBuy.length
        ? [
            {
              id: `buy-x${Date.now().toString(36)}`,
              kind: 'buy',
              trackIds: moveToBuy,
              titles: moveToBuy.map((id) => titles.get(id) ?? 'Untitled track'),
              costStroops: BUY_COST_STROOPS * BigInt(moveToBuy.length),
              status: 'pending',
            },
          ]
        : [];
      if (keep.length === 0) {
        // Nothing left to sign in this step: drop it without charging (ours only).
        const dropped = writeIfStill(step.id, mine(), (shared) => [...removeIn(step.id)(shared), ...extra]);
        if (dropped === 'ok') finishIfDone();
        else if (dropped === 'lost') {
          requireReconfirm('Another tab took over this purchase, so this tab changed nothing. Check the step below.');
        }
        return;
      }
      const updated = writeIfStill(step.id, mine(), (shared) => [...patchIn(step.id, narrowed)(shared), ...extra]);
      if (updated !== 'ok' || (activeLease && !activeLease.stillHeld())) {
        if (updated === 'lost') {
          requireReconfirm('Another tab took over this purchase, so this tab sent nothing. Check the step below.');
        } else {
          abortUnsaved(step.id, resumeStatus);
        }
        return;
      }
      const working = steps;
      const current = working.find((s) => s.id === step.id)!;
      // Final signing guard (C-10): nothing is built or simulated unless the
      // pre-flight KALE read is KNOWN and covers this step.
      const guard = kaleGuard(kale, current.costStroops);
      if (guard !== 'ok') {
        writeIfStill(
          step.id,
          mine(),
          patchIn(step.id, {
            status: resumeStatus === 'cancelled' ? 'cancelled' : 'pending',
            failure: undefined,
            ownerTabId: undefined,
            leaseExpiresAt: undefined,
          })
        );
        notices = [
          ...notices,
          {
            tone: 'warning',
            text:
              guard === 'short'
                ? 'Not enough KALE for this step. Add KALE and continue.'
                : "We couldn't check your KALE balance, so nothing was signed. Try again.",
          },
        ];
        return;
      }

      /**
       * Pre-relay guard (after the passkey returns, before relay / POST /mint):
       * (a) the shared record must still show THIS tab + attempt signing, with a
       *     live claim or the cross-tab lock still held — else another tab took
       *     over: throw without writing anything;
       * (b) `submitting` must be durably saved — else throw.
       * Either throw discards the signed payload locally; it is never relayed.
       */
      const onBeforeSubmit = ({ expiresAtLedger }: { expiresAtLedger: number }) => {
        if (gen !== generation) throw new SubmitGuardError('stale');
        const holdsLock = holdingWebLock || Boolean(activeLease?.stillHeld());
        if (!ownsSigningClaim(readSharedSteps(true), { stepId: step.id, tabId: TAB_ID, attemptId, now: Date.now(), holdsLock })) {
          steps = readSharedSteps(true) ?? [];
          throw new SubmitGuardError('stale');
        }
        const saved = writeIfStill(step.id, mine(), patchIn(step.id, { status: 'submitting', since: Date.now(), expiresAtLedger }));
        if (saved === 'lost') throw new SubmitGuardError('stale');
        if (saved === 'unsaved') throw new SubmitGuardError('unsaved');
        phase = 'submitting';
      };

      if (current.kind === 'mint') {
        const { submitMintBatch } = await import('../hooks/useMixtapeMinting');
        const mintTracks = stepTracks
          .filter((t) => keep.includes(t.id))
          .map((t) => ({ id: t.id, creator: t.address ?? '' }));
        const result = await submitMintBatch({ tracks: mintTracks, userContractId: holder, userKeyId: keyId, onBeforeSubmit });
        if (gen !== generation) return;
        const accepted = keep.filter((id) => result.acceptedIds.includes(id));
        if (result.alreadyMintedIds.length) {
          notices = [
            ...notices,
            ...result.alreadyMintedIds.map((id) => ({
              tone: 'info' as const,
              text: `“${titles.get(id) ?? 'A song'}” was minted by someone else a moment ago. Check again to buy it.`,
            })),
          ];
        }
        if (accepted.length === 0) {
          writeIfStill(step.id, mine(), removeIn(step.id));
          void refresh({ markLoading: false });
          return;
        }
        writeIfStill(
          step.id,
          mine(),
          patchIn(step.id, {
            status: 'confirming',
            workflowIds: result.workflowIds.length ? result.workflowIds : undefined,
            trackIds: accepted,
            titles: accepted.map((id) => titles.get(id) ?? 'Untitled track'),
            costStroops: unitCost * BigInt(accepted.length),
          })
        );
        phase = 'confirming';
        startMintPolling();
      } else {
        const { submitBuyBatch } = await import('../hooks/useMixtapePurchase');
        const buyTracks = keep.map((id) => {
          const identity = resolveTrackIdentity(stepTracks.find((t) => t.id === id)!, facts.get(id));
          if (identity.mint !== 'minted') throw new Error('Buy target is not minted');
          return { id, sac: identity.sac, pool: identity.pool };
        });
        await submitBuyBatch({ tracks: buyTracks, userContractId: holder, userKeyId: keyId, onBeforeSubmit });
        if (gen !== generation) return;
        if (writeIfStill(step.id, mine(), patchIn(step.id, { status: 'confirming' })) === 'ok') {
          phase = 'confirming';
          void confirmBuy(step.id, keep);
        }
      }
    } catch (error) {
      if (gen !== generation) return;
      if (error instanceof SubmitGuardError) {
        if (error.reason === 'stale') {
          // Another tab owns this step now: leave its record untouched, show it.
          steps = readSharedSteps(true) ?? [];
          requireReconfirm('Another tab took over this purchase, so this tab sent nothing. Check the step below.');
        } else {
          abortUnsaved(step.id, resumeStatus, true);
        }
        return;
      }
      logger.error('collect', `Step ${step.id} failed`, error);
      // This ATTEMPT's own phase (never inherited from another tab's record).
      // Only a step that never left the device (or a definite 4xx refusal) is
      // safely "not charged"; 5xx / transport errors after submission are
      // `uncertain` and lock their songs until reconciled.
      const failure = classifySubmitFailure({
        error,
        status: (error as { status?: number })?.status,
        phase: phase === 'signing' ? 'signing' : 'submitting',
      });
      const result = writeIfStill(
        step.id,
        mine(),
        patchIn(step.id, {
          status: failure === 'cancelled' ? 'cancelled' : 'failed',
          failure,
          ownerTabId: undefined,
          leaseExpiresAt: undefined,
        })
      );
      if (result === 'lost') {
        requireReconfirm('Another tab took over this purchase, so this tab changed nothing. Check the step below.');
      }
    } finally {
      clearInterval(leaseTimer);
    }
  }

  async function confirmBuy(stepId: string, ids: string[]) {
    const gen = generation;
    // Only resolve the exact attempt that was in flight when this loop started.
    // Raw `submitting` (relay response lost / reload mid-relay) or `confirming`.
    const guard = captureGuard(stepId, ['submitting', 'confirming']) ?? NO_MATCH;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 2_500 : 3_500));
      if (gen !== generation) return;
      await refresh({ ids, markLoading: false });
      if (gen !== generation) return;
      const owned = ids.every((id) => {
        const h = holdings.get(id);
        return h?.status === 'known' && h.balance > 0n;
      });
      if (owned) {
        if (writeIfStill(stepId, guard, patchIn(stepId, { status: 'done' })) === 'ok') finishIfDone();
        return;
      }
    }
    writeIfStill(stepId, guard, patchIn(stepId, { status: 'failed', failure: 'uncertain' }));
  }

  function startMintPolling() {
    const holder = userState.contractId;
    if (!holder) return;
    // ONE raw persisted snapshot drives both the request and the write guards.
    const targets = mintPollTargets(readSharedSteps(true) ?? []);
    const ids = targets.flatMap((t) => t.trackIds).filter((id) => !settledMintIds.has(id));
    pollAbort?.abort();
    if (ids.length === 0) return;
    const controller = new AbortController();
    pollAbort = controller;
    const gen = generation;
    const since = Math.min(...targets.map((t) => t.since ?? Date.now()));
    const guards = new Map<string, { guard: StepGuard; trackIds: string[]; hasWorkflow: boolean }>(
      targets.map((t) => [
        t.stepId,
        {
          guard: {
            attemptId: t.attemptId,
            owner: { id: t.ownerTabId },
            statuses: ['submitting', 'confirming'],
            trackKey: t.trackIds.join(','),
            workflowKey: t.workflowIds.join(','),
          },
          trackIds: t.trackIds,
          hasWorkflow: t.workflowIds.length > 0,
        },
      ])
    );
    void (async () => {
      try {
        const { pollMintSettlement } = await import('../hooks/useMixtapeMinting');
        const { remaining } = await pollMintSettlement({
          ids,
          workflowIds: targets.flatMap((t) => t.workflowIds),
          // No workflow id yet (POST /mint response pending): settle from chain only.
          chainOnlyIds: targets.filter((t) => t.workflowIds.length === 0).flatMap((t) => t.trackIds),
          holder,
          signal: controller.signal,
          deadline: since + MINT_CONFIRM_TIMEOUT_MS,
          onSettled: (settled) => {
            if (gen !== generation) return;
            for (const id of settled) settledMintIds.add(id);
            void settleMints(guards);
          },
          onFailed: (failed) => {
            if (gen !== generation) return;
            for (const [stepId, { guard, trackIds, hasWorkflow }] of guards) {
              // A workflow failure only applies to the attempt that owns that workflow.
              if (hasWorkflow && trackIds.some((id) => failed.includes(id))) {
                writeIfStill(stepId, guard, patchIn(stepId, { status: 'failed', failure: 'rejected' }));
              }
            }
          },
        });
        if (gen !== generation || controller.signal.aborted) return;
        for (const [stepId, { guard, trackIds }] of guards) {
          if (trackIds.some((id) => remaining.includes(id))) {
            writeIfStill(stepId, guard, patchIn(stepId, { status: 'failed', failure: 'timeout' }));
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) logger.warn('collect', 'Mint poll stopped', error);
      }
    })();
  }

  /** ONE batched post-settlement refresh, then close out settled mint steps. */
  async function settleMints(guards: Map<string, { guard: StepGuard; trackIds: string[]; hasWorkflow: boolean }>) {
    const ready = [...guards].filter(([, g]) => g.trackIds.every((id) => settledMintIds.has(id)));
    if (ready.length === 0) return;
    await refresh({ markLoading: false });
    for (const [stepId, { guard }] of ready) {
      writeIfStill(stepId, guard, patchIn(stepId, { status: 'done' }));
    }
    finishIfDone();
  }

  function resumeConfirming() {
    if (steps.some((s) => s.kind === 'mint' && s.status === 'confirming')) startMintPolling();
    for (const s of steps) {
      if (s.kind === 'buy' && s.status === 'confirming') void confirmBuy(s.id, s.trackIds);
    }
    // Restored unsettled outcomes are reconciled (read-only), never re-signed.
    if (steps.some((s) => s.status === 'failed' && isLocked(s))) void reconcileLocked();
  }

  /**
   * Reconcile every locked step (submitted, confirming, uncertain, timed out)
   * against ONE fresh chain read: owned → done; signature expired and still not
   * held → `expired` (never landed, safe to retry); otherwise it stays locked.
   */
  async function reconcileLocked() {
    const holder = userState.contractId;
    const locked = steps.filter(isLocked);
    if (!holder || locked.length === 0) return;
    const gen = generation;
    const ids = [...new Set(locked.flatMap((s) => s.trackIds))];
    // Raw guards captured BEFORE the read: a record changed meanwhile is left alone.
    const guards = new Map(locked.map((st) => [st.id, captureGuard(st.id) ?? NO_MATCH] as const));
    let latestLedger: number | null = null;
    let readIds = new Set<string>();
    try {
      const snap = await readSnapshot({
        mixtapeId: opts.getMixtapeId(),
        tracks: untrack(() => tracks).filter((t) => ids.includes(t.id)),
        holder,
        includeKale: true,
        serverFirst: false,
      });
      if (gen !== generation) return;
      applySnapshot(snap, ids);
      latestLedger = snap.latestLedger;
      readIds = new Set(ids.filter((id) => snap.tracks.get(id)?.holding.status === 'known'));
    } catch (error) {
      logger.warn('collect', 'Reconciliation read failed; steps stay locked', error);
      return;
    }
    const now = Date.now();
    for (const step of locked) {
      // Confirming buys are owned by confirmBuy; confirming mints by the poll.
      if (step.status === 'confirming' || step.status === 'submitting') {
        const ownedAll = step.trackIds.every((id) => {
          const h = holdings.get(id);
          return h?.status === 'known' && h.balance > 0n;
        });
        if (!ownedAll) continue;
      }
      const ok = step.trackIds.every((id) => readIds.has(id));
      const ownedAll = step.trackIds.every((id) => {
        const h = holdings.get(id);
        return h?.status === 'known' && h.balance > 0n;
      });
      const next = reconcileStep(step, { ok, ownedAll, latestLedger, now });
      if (next !== step) {
        writeIfStill(step.id, guards.get(step.id) ?? NO_MATCH, patchIn(step.id, { status: next.status, failure: next.failure }));
      }
    }
    finishIfDone();
  }

  function finishIfDone() {
    if (steps.length === 0) {
      if (view === 'progress') view = 'review';
      return;
    }
    if (flowKind(steps) !== 'done') return;
    const s = untrack(() => summary);
    const added = steps.reduce((n, step) => n + step.trackIds.length, 0);
    doneSummary = { owned: s.owned, total: s.total, added };
    view = 'done';
    // Already persisted by the guarded write that completed the last step.
    const title = opts.getMixtapeTitle();
    toast.success(s.owned === s.collectible ? `You own “${title}”.` : `You own ${added} more ${added === 1 ? 'song' : 'songs'}.`, {
      tag: TOAST_TAG,
      actionLabel: 'See songs',
      onAction: () => {
        view = 'holdings';
        sheetOpen = true;
      },
    });
    void refresh({ markLoading: false });
  }

  return {
    get holdings() {
      return holdings;
    },
    get kale() {
      return kale;
    },
    get hydrated() {
      return hydrated;
    },
    get refreshing() {
      return refreshing;
    },
    get lastCheckedAt() {
      return lastCheckedAt;
    },
    get rows() {
      return rows;
    },
    get states() {
      return states;
    },
    get balances() {
      return balances;
    },
    get summary() {
      return summary;
    },
    get plan() {
      return plan;
    },
    get fullPlan() {
      return fullPlan;
    },
    get page() {
      return page;
    },
    get card() {
      return card;
    },
    get steps() {
      return steps;
    },
    get flowKind() {
      return kind;
    },
    get selection() {
      return selection;
    },
    get sheetOpen() {
      return sheetOpen;
    },
    get view() {
      return view;
    },
    set view(v: CollectSheetView) {
      view = v;
    },
    get notices() {
      return notices;
    },
    get approving() {
      return approving;
    },
    get doneSummary() {
      return doneSummary;
    },
    get affordable() {
      return affordable;
    },
    get signedIn() {
      return signedIn;
    },
    onCardAction,
    refresh: () => refresh(),
    refreshKale,
    openReview,
    openView,
    toggleTrack,
    selectAffordable,
    approveNext,
    startOver,
    acknowledge,
    closeSheet,
  };
}

export type CollectController = ReturnType<typeof createCollectController>;
