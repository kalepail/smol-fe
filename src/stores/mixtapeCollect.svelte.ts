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
  if (import.meta.env.PUBLIC_CHAIN_SNAPSHOT !== '1') return null;
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
    const body = (await response.json()) as {
      kale?: { state: string; amount?: string };
      tracks?: {
        id: string;
        sac: string | null;
        pool: string | null;
        mint: 'verified' | 'unminted' | 'unresolved';
        balance?: { state: string; amount?: string };
        reserves?: { token: string; balance: string }[];
      }[];
    };
    const kaleSac = import.meta.env.PUBLIC_KALE_SAC_ID;
    const now = Date.now();
    const tracks = new Map<string, { facts: ChainFacts; holding: Holding }>();
    let errors = 0;
    for (const t of body.tracks ?? []) {
      let facts: ChainFacts;
      if (t.mint === 'verified' && t.sac && t.pool) {
        const reserve = t.reserves?.find((r) => r.token === kaleSac)?.balance;
        facts = { status: 'minted', sac: t.sac, pool: t.pool, kaleReserve: reserve ? BigInt(reserve) : undefined };
      } else if (t.mint === 'unminted') {
        facts = { status: 'unminted' };
      } else {
        facts = { status: 'unresolved' };
      }
      const holding: Holding =
        t.balance?.state === 'known' && t.balance.amount !== undefined
          ? { status: 'known', balance: BigInt(t.balance.amount), checkedAt: now }
          : facts.status === 'unminted'
            ? { status: 'known', balance: 0n, checkedAt: now }
            : { status: 'error', message: 'Unknown' };
      if (holding.status === 'error' && facts.status === 'minted') errors++;
      tracks.set(t.id, { facts, holding });
    }
    const kale: SnapshotResult['kale'] =
      body.kale?.state === 'known' && body.kale.amount !== undefined
        ? { status: 'known', balance: BigInt(body.kale.amount) }
        : { status: 'error' };
    return { latestLedger: null, tracks, kale, errors };
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

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: progress just isn't resumable across reloads */
  }
}

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

  function persist() {
    const key = storageKey();
    if (!key) return;
    const k = flowKind(steps);
    writeStorage(key, steps.length && k !== 'done' ? serializeFlow(steps, Date.now()) : null);
  }

  function setSteps(next: FlowStep[]) {
    steps = next;
    persist();
  }

  /**
   * Shared progress for this wallet + mixtape as other tabs last wrote it.
   * `live` keeps in-flight statuses as written (another tab may be signing);
   * inside the cross-tab lock nobody else can be signing, so in-flight statuses
   * left behind by a closed tab are normalised like a reload.
   */
  function readSharedSteps(live: boolean): FlowStep[] | null {
    const key = storageKey();
    return key ? restoreFlow(readStorage(key), Date.now(), { live }) : null;
  }

  /** Read-modify-write against the freshest shared progress (never clobbers another tab). */
  function patchStep(id: string, patch: Partial<FlowStep>) {
    const shared = readSharedSteps(true);
    const base = shared && shared.some((s) => s.id === id) ? shared : steps;
    setSteps(base.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  /**
   * Serialize every progress-mutating action (approve, start over, acknowledge)
   * across tabs for this wallet + mixtape. Inside the lock the shared progress is
   * re-read before anything is written or signed, so a second tab can never
   * overwrite another tab's submitted/uncertain lock or submit a duplicate buy.
   */
  async function withCollectLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    const name = `smol-collect:${userState.contractId ?? ''}:${opts.getMixtapeId()}`;
    const run = async () => {
      const shared = readSharedSteps(false);
      steps = shared ?? [];
      return fn();
    };
    // Fallback (no Web Locks): the in-lock re-read above still applies.
    return locks?.request ? (locks.request(name, { mode: 'exclusive' }, run) as Promise<T>) : run();
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
          const restored = restoreFlow(readStorage(flowStorageKey(wallet, mixtapeId)), Date.now());
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

  // Another tab wrote progress for this wallet + mixtape: reflect it at once
  // (its submitted/uncertain locks exclude those songs from our plan).
  $effect(() => {
    const onStorage = (event: StorageEvent) => {
      const key = storageKey();
      if (!key || event.key !== key) return;
      steps = (event.newValue ? restoreFlow(event.newValue, Date.now(), { live: true }) : null) ?? [];
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
    if (kind === 'done') setSteps([]);
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
        void approveNext();
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
        view = 'progress';
        sheetOpen = true;
        break;
      default:
        break;
    }
  }

  function openView(next: CollectSheetView) {
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
      setSteps([]);
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

  async function approveNext(): Promise<void> {
    if (approving) return;
    const holder = userState.contractId;
    const keyId = userState.keyId;
    if (!holder || !keyId) {
      resumeIntent = true;
      openAuthSheet('signin', 'Sign in to collect songs from this mixtape.');
      return;
    }
    const gen = generation;
    // What the user confirmed: the plan's exact songs (re-checked inside the lock).
    const confirmed = planKey(plan);
    approving = true;
    try {
      await withCollectLock(() => approveNextLocked(holder, keyId, gen, confirmed));
    } finally {
      if (gen === generation) approving = false;
    }
  }

  function planKey(p: typeof plan): string {
    return p ? p.steps.map((x) => `${x.kind}:${x.trackIds.join(',')}`).join('|') : '';
  }

  async function approveNextLocked(holder: string, keyId: string, gen: number, confirmed: string): Promise<void> {
    if (gen !== generation) return;
    if (flowKind(steps) === 'done') setSteps([]);

    let step = nextRunnableStep(steps);
    if (!step) {
      // Unsettled outcomes are re-checked, never re-signed.
      if (steps.some((s) => s.status === 'failed')) {
        await reconcileLocked();
        if (steps.some(isLocked)) {
          notices = [
            ...notices,
            {
              tone: 'warning',
              text: "An earlier purchase for this mixtape isn't confirmed yet, so nothing new was signed. Its songs won't be charged again.",
            },
          ];
          view = 'progress';
        }
        return;
      }
      const p = plan;
      if (!p || p.steps.length === 0) return;
      if (planKey(p) !== confirmed) {
        // Shared progress changed under us (another tab submitted): re-confirm.
        notices = [
          ...notices,
          { tone: 'warning', text: 'Another purchase for this mixtape is in progress or unconfirmed. Review the updated total before collecting.' },
        ];
        return;
      }
      if (kaleGuard(kale, p.costStroops) !== 'ok') return;
      const suffix = steps.length ? `-${Date.now().toString(36)}` : '';
      const added = stepsFromPlan(p, titles).map((s) => ({ ...s, id: `${s.id}${suffix}` }));
      setSteps([...steps, ...added]);
      notices = [];
      view = 'progress';
      step = added[0];
    }

    const resumeStatus = step.status;
    patchStep(step.id, { status: 'signing', failure: undefined });
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
      let working = steps.map((s) =>
        s.id === step.id
          ? {
              ...s,
              trackIds: keep,
              titles: keep.map((id) => titles.get(id) ?? 'Untitled track'),
              costStroops: unitCost * BigInt(keep.length),
            }
          : s
      );
      if (moveToBuy.length) {
        working = [
          ...working,
          {
            id: `buy-x${Date.now().toString(36)}`,
            kind: 'buy',
            trackIds: moveToBuy,
            titles: moveToBuy.map((id) => titles.get(id) ?? 'Untitled track'),
            costStroops: BUY_COST_STROOPS * BigInt(moveToBuy.length),
            status: 'pending',
          },
        ];
      }
      if (keep.length === 0) {
        // Nothing left to sign in this step: drop it without charging.
        setSteps(working.filter((s) => s.id !== step.id));
        finishIfDone();
        return;
      }
      setSteps(working);
      const current = working.find((s) => s.id === step.id)!;
      // Final signing guard (C-10): nothing is built or simulated unless the
      // pre-flight KALE read is KNOWN and covers this step.
      const guard = kaleGuard(kale, current.costStroops);
      if (guard !== 'ok') {
        patchStep(step.id, { status: resumeStatus === 'cancelled' ? 'cancelled' : 'pending', failure: undefined });
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

      const onSigned = ({ expiresAtLedger }: { expiresAtLedger: number }) => {
        if (gen === generation) patchStep(step.id, { status: 'submitting', since: Date.now(), expiresAtLedger });
      };

      if (current.kind === 'mint') {
        const { submitMintBatch } = await import('../hooks/useMixtapeMinting');
        const mintTracks = stepTracks
          .filter((t) => keep.includes(t.id))
          .map((t) => ({ id: t.id, creator: t.address ?? '' }));
        const result = await submitMintBatch({ tracks: mintTracks, userContractId: holder, userKeyId: keyId, onSigned });
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
          setSteps(steps.filter((s) => s.id !== step.id));
          void refresh({ markLoading: false });
          return;
        }
        patchStep(step.id, {
          status: 'confirming',
          workflowIds: result.workflowIds.length ? result.workflowIds : undefined,
          trackIds: accepted,
          titles: accepted.map((id) => titles.get(id) ?? 'Untitled track'),
          costStroops: unitCost * BigInt(accepted.length),
        });
        startMintPolling();
      } else {
        const { submitBuyBatch } = await import('../hooks/useMixtapePurchase');
        const buyTracks = keep.map((id) => {
          const identity = resolveTrackIdentity(stepTracks.find((t) => t.id === id)!, facts.get(id));
          if (identity.mint !== 'minted') throw new Error('Buy target is not minted');
          return { id, sac: identity.sac, pool: identity.pool };
        });
        await submitBuyBatch({ tracks: buyTracks, userContractId: holder, userKeyId: keyId, onSigned });
        if (gen !== generation) return;
        patchStep(step.id, { status: 'confirming' });
        void confirmBuy(step.id, keep);
      }
    } catch (error) {
      if (gen !== generation) return;
      logger.error('collect', `Step ${step.id} failed`, error);
      const was = steps.find((s) => s.id === step.id)?.status;
      // Only a step that never left the device (or a definite 4xx refusal) is
      // safely "not charged"; 5xx / transport errors after submission are
      // `uncertain` and lock their songs until reconciled.
      const failure = classifySubmitFailure({
        error,
        status: (error as { status?: number })?.status,
        phase: was === 'submitting' ? 'submitting' : 'signing',
      });
      patchStep(step.id, { status: failure === 'cancelled' ? 'cancelled' : 'failed', failure });
    }
  }

  async function confirmBuy(stepId: string, ids: string[]) {
    const gen = generation;
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
        patchStep(stepId, { status: 'done' });
        finishIfDone();
        return;
      }
    }
    patchStep(stepId, { status: 'failed', failure: 'uncertain' });
  }

  function startMintPolling() {
    const holder = userState.contractId;
    if (!holder) return;
    const confirming = steps.filter((s) => s.kind === 'mint' && s.status === 'confirming');
    const ids = confirming.flatMap((s) => s.trackIds).filter((id) => !settledMintIds.has(id));
    pollAbort?.abort();
    if (ids.length === 0) return;
    const controller = new AbortController();
    pollAbort = controller;
    const gen = generation;
    const since = Math.min(...confirming.map((s) => s.since ?? Date.now()));
    void (async () => {
      try {
        const { pollMintSettlement } = await import('../hooks/useMixtapeMinting');
        const { remaining } = await pollMintSettlement({
          ids,
          workflowIds: confirming.flatMap((s) => s.workflowIds ?? []),
          holder,
          signal: controller.signal,
          deadline: since + MINT_CONFIRM_TIMEOUT_MS,
          onSettled: (settled) => {
            if (gen !== generation) return;
            for (const id of settled) settledMintIds.add(id);
            void settleMints();
          },
          onFailed: (failed) => {
            if (gen !== generation) return;
            for (const s of steps) {
              if (s.kind === 'mint' && s.status === 'confirming' && s.trackIds.some((id) => failed.includes(id))) {
                patchStep(s.id, { status: 'failed', failure: 'rejected' });
              }
            }
          },
        });
        if (gen !== generation || controller.signal.aborted) return;
        for (const s of steps) {
          if (s.kind === 'mint' && s.status === 'confirming' && s.trackIds.some((id) => remaining.includes(id))) {
            patchStep(s.id, { status: 'failed', failure: 'timeout' });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) logger.warn('collect', 'Mint poll stopped', error);
      }
    })();
  }

  /** ONE batched post-settlement refresh, then close out settled mint steps. */
  async function settleMints() {
    const ids = steps
      .filter((s) => s.kind === 'mint' && s.status === 'confirming')
      .flatMap((s) => s.trackIds)
      .filter((id) => settledMintIds.has(id));
    if (ids.length === 0) return;
    await refresh({ markLoading: false });
    for (const s of steps) {
      if (s.kind === 'mint' && s.status === 'confirming' && s.trackIds.every((id) => settledMintIds.has(id))) {
        patchStep(s.id, { status: 'done' });
      }
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
      if (next !== step) patchStep(step.id, { status: next.status, failure: next.failure });
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
    persist();
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
