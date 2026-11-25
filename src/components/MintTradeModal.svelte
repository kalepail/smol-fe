<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Sheet from './ui/Sheet.svelte';
  import Loader from './ui/Loader.svelte';
  import Button from './ui/Button.svelte';
  import TradeForm from './trade/TradeForm.svelte';
  import TradeBalances from './trade/TradeBalances.svelte';
  import TradeSimulation from './trade/TradeSimulation.svelte';
  import { captureSessionTicket, userState } from '../stores/user.svelte';
  import { beginKaleBalanceRead, setKnownKaleBalance } from '../stores/balance.svelte';
  import { openAuthSheet } from '../stores/authSheet.svelte';
  import { toast } from '../stores/toast.svelte';
  import { logger } from '../utils/logger';
  import { Client as CometClient } from 'comet-sdk';
  import { useTradeSimulation } from '../hooks/useTradeSimulation';
  import { useTradeExecution } from '../hooks/useTradeExecution';
  import { readCometTradeSnapshot, quoteTrade, type CometTradeSnapshot } from '../utils/cometPool';
  import { cometMaxIn, CometQuoteError } from '../utils/cometQuote';
  import { KALE_DECIMALS } from '../utils/mixtapePricing';
  import {
    minAmountOutFor,
    SINGLE_SWAP_REJECTED_COPY,
    SINGLE_SWAP_REQUOTE_COPY as SINGLE_SWAP_REQUOTE_NOTICE,
    SlippageExceededError,
  } from '../utils/slippage';
  import {
    canSubmitTrade,
    isActionableQuote,
    quoteMatchesInput,
    refreshThenRequote,
    RESERVE_REFRESH_FAILED_COPY,
    type ReserveFreshness,
  } from '../utils/tradeQuoteGate';
  import {
    computeAmmBuyCap,
    computeMaxBuy,
    formatAmount,
    parseInputToUnits,
  } from '../utils/tradeCalculations';

  const DISPLAY_TOKEN_NAME = 'SMOL';

  interface Props {
    open?: boolean;
    ammId: string;
    mintTokenId: string;
    songId: string;
    title?: string;
    imageUrl?: string;
    onClose: () => void;
    onComplete: (updatedMintBalance?: bigint) => void;
    onVerified?: (market: { sac: string; pool: string }) => void;
  }

  let {
    open = true,
    ammId,
    mintTokenId,
    songId,
    title,
    imageUrl,
    onClose,
    onComplete,
    onVerified,
  }: Props = $props();

  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let mode = $state<'buy' | 'sell'>('buy');
  let previousMode = $state<'buy' | 'sell'>('buy');
  let inputAmount = $state('');
  let submitting = $state(false);

  let simulationLoading = $state(false);
  let simulationError = $state<string | null>(null);
  let simulatedAmountOut = $state<bigint | null>(null);
  let lastSimulatedMode = $state<'buy' | 'sell'>('buy');
  /** The exact (mode, input) the current quote was computed for. */
  let quotedFor = $state<{ mode: 'buy' | 'sell'; amount: bigint } | null>(null);
  /** Shown after the pool refused a swap below `min_amount_out` (quote refreshed). */
  let requoteNotice = $state<string | null>(null);
  /**
   * Reserve snapshot freshness. After a slippage rejection the snapshot is
   * stale: no quote may be shown or traded until a fresh read SUCCEEDS.
   */
  let reserves = $state<ReserveFreshness>('fresh');
  /** The rejection notice to show once a retried refresh succeeds. */
  let pendingRequoteNotice: string | null = null;

  let cometClient = $state<CometClient | null>(null);
  let snapshot = $state<CometTradeSnapshot | null>(null);

  // KALE and song tokens are SACs with a fixed 7 decimals (no decimals() RPC).
  const kaleDecimals = KALE_DECIMALS;
  const mintDecimals = KALE_DECIMALS;
  const kaleSymbol = 'KALE';

  let ammKaleBalance = $state<bigint>(0n);
  let userKaleBalance = $state<bigint>(0n);
  let userMintBalance = $state<bigint>(0n);

  let maxBuyAmount = $state<bigint>(0n);
  let ammBuyCap = $state<bigint>(0n);
  let maxSellAmount = $state<bigint>(0n);

  let currentContractId = $derived(userState.contractId);
  // Report 31: only the audited Comet executable may be quoted or traded.
  const unsupportedPool = $derived(snapshot !== null && !snapshot.auditedPool);
  const UNSUPPORTED_POOL_COPY = 'Unsupported pool contract version';
  let currentKeyId = $derived(userState.keyId);

  const simulationHook = useTradeSimulation();
  const executionHook = useTradeExecution();

  onMount(() => {
    void initialize();
    return () => {
      simulationHook.clearTimer();
    };
  });

  /**
   * One trade snapshot read for the wallet active when it STARTS. The holder
   * and the balance store's sequencing ticket are captured before the request,
   * so a response for a wallet that is no longer active (account switch while
   * in flight) is dropped instead of being labelled with the new wallet.
   */
  async function readSnapshotForActiveHolder(opts: { fresh?: boolean } = {}): Promise<CometTradeSnapshot | null> {
    const requestedHolder = userState.contractId;
    const kaleSeq = requestedHolder ? beginKaleBalanceRead(requestedHolder) : null;
    const next = await readCometTradeSnapshot({
      songId,
      d1Token: mintTokenId || null,
      d1Amm: ammId || null,
      holder: requestedHolder,
      fresh: opts.fresh,
    });
    if (requestedHolder !== userState.contractId) return null; // stale: another wallet's balances
    if (requestedHolder && kaleSeq !== null && next.userKale !== null) {
      setKnownKaleBalance(requestedHolder, next.userKale, { seq: kaleSeq });
    }
    return next;
  }

  /** The wallet whose balances and limits this dialog is showing (or loading). */
  let loadedHolder: string | null = untrack(() => userState.contractId);
  /** Bumped per (re)load: only the newest load may apply its snapshot. */
  let loadGeneration = 0;

  /** Forget everything derived from the previous holder: balances, limits, quote. */
  function clearHolderState() {
    snapshot = null;
    cometClient = null;
    userKaleBalance = 0n;
    userMintBalance = 0n;
    ammKaleBalance = 0n;
    maxBuyAmount = 0n;
    ammBuyCap = 0n;
    maxSellAmount = 0n;
    inputAmount = '';
    simulationHook.invalidate();
    simulationHook.clearTimer();
    simulationLoading = false;
    simulationError = null;
    simulatedAmountOut = null;
    quotedFor = null;
    requoteNotice = null;
    reserves = 'fresh';
    pendingRequoteNotice = null;
    // A previous holder's pending swap no longer belongs to this dialog.
    submitting = false;
  }

  // Holder changed while open (account switch, sign-out, another tab): never
  // keep showing (or trading against) the previous wallet's balances, quote or
  // limits. Signed out: close. Another wallet: reload for it.
  $effect(() => {
    const holder = userState.contractId;
    untrack(() => {
      if (holder === loadedHolder) return;
      const previous = loadedHolder;
      loadedHolder = holder;
      loadGeneration++;
      clearHolderState();
      if (!holder && previous) {
        loading = false;
        onClose();
        return;
      }
      void initialize();
    });
  });

  function applySnapshot(next: CometTradeSnapshot) {
    snapshot = next;
    // The pool's KALE *reserve* (AllRecordData) bounds a buy, not its SAC balance.
    ammKaleBalance = next.kaleRecord.balance;
    userKaleBalance = next.userKale ?? 0n;
    userMintBalance = next.userMint ?? 0n;
    recomputeLimits();
  }

  async function initialize() {
    const load = ++loadGeneration;
    loading = true;
    loadError = null;
    simulationLoading = false; // a previous load's simulation can no longer clear it
    simulationError = null;
    simulatedAmountOut = null;
    quotedFor = null;
    requoteNotice = null;
    reserves = 'fresh';
    pendingRequoteNotice = null;
    try {
      // Resolve + verify the canonical market BEFORE showing balances or quotes.
      // `ammId` / `mintTokenId` are D1 hints only; trading always uses the
      // verified canonical pair (C-15: D1 rows can be cross-wired or empty).
      const next = await readSnapshotForActiveHolder();
      // Superseded (the holder-change effect started a newer load) or the
      // wallet changed mid-read: the newer load owns the dialog.
      if (load !== loadGeneration) return;
      if (!next) {
        // The wallet changed mid-read: start over for the active wallet.
        await initialize();
        return;
      }
      cometClient = new CometClient({
        contractId: next.pool,
        rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
        networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
      });
      applySnapshot(next);
      onVerified?.({ sac: next.mintToken, pool: next.pool });
    } catch (error) {
      if (load !== loadGeneration) return;
      logger.error('trade', error);
      loadError = error instanceof Error ? error.message : 'Failed to load trading data.';
    } finally {
      if (load === loadGeneration) loading = false;
    }
  }

  /** Sequence of snapshot reads started in this dialog (initial load excluded). */
  let snapshotReadSeq = 0;
  /** The newest read whose snapshot was applied: an older one never overwrites it. */
  let appliedReadSeq = 0;
  /**
   * Reads started at or before this sequence predate the pool's last slippage
   * rejection: their reserves are exactly what the pool refused, so they are
   * never applied once the rejection happened.
   */
  let rejectedThroughSeq = 0;

  /**
   * Re-read reserves + balances. Resolves `true` once a FRESH snapshot was
   * applied, `false` if the dialog moved on (reload / account switch) or the
   * result is older than one already applied or than the last rejection; a
   * read failure THROWS — callers decide whether a stale snapshot is acceptable.
   *
   * `fresh: true` never joins an already-sent ledger request: recovery after a
   * rejection must observe the ledger AFTER the rejection, not a pre-rejection
   * read still in flight.
   */
  async function readFreshSnapshot(opts: { fresh?: boolean } = {}): Promise<boolean> {
    const load = loadGeneration;
    const seq = ++snapshotReadSeq;
    const next = await readSnapshotForActiveHolder(opts);
    if (!next || load !== loadGeneration) return false;
    if (seq <= rejectedThroughSeq || seq < appliedReadSeq) return false;
    appliedReadSeq = seq;
    applySnapshot(next);
    return true;
  }

  /** After a completed swap: balances are informational, a failed read is logged. */
  async function refreshAllBalances() {
    try {
      await readFreshSnapshot();
    } catch (error) {
      logger.error('trade', 'Failed to refresh trade balances', error);
    }
  }

  /** Drop the shown quote / floor (and any in-flight simulation for it). */
  function invalidateQuote() {
    simulationHook.invalidate();
    simulationLoading = false;
    simulationError = null;
    simulatedAmountOut = null;
    quotedFor = null;
  }

  /**
   * The pool refused a swap below its floor: the snapshot that produced the
   * quote is stale. Re-read reserves and re-quote ONLY from a successful read;
   * if the read fails, keep trading disabled and offer Retry.
   */
  async function recoverFromRejection(notice: string, stillCurrent: () => boolean) {
    reserves = 'refreshing';
    requoteNotice = null;
    pendingRequoteNotice = notice;
    // Every read already started (in flight or not) predates this rejection.
    rejectedThroughSeq = snapshotReadSeq;
    invalidateQuote();
    const outcome = await refreshThenRequote({
      refresh: async () => {
        // A NEW ledger request (never joins a pre-rejection one still in flight).
        const applied = await readFreshSnapshot({ fresh: true });
        if (applied && stillCurrent()) reserves = 'fresh';
        return applied && stillCurrent();
      },
      // Only a settled, positive quote for exactly the current input counts as
      // "refreshed" (a max-buy / validation error leaves Buy disabled).
      requote: async () => {
        await runSimulation();
        return isActionableQuote({
          mode,
          amount: parseInputToUnits(inputAmount, mode === 'buy' ? kaleDecimals : mintDecimals),
          quotedFor,
          quotedAmountOut: simulatedAmountOut,
          quoteLoading: simulationLoading,
          quoteError: simulationError,
          reserves,
        });
      },
    });
    if (!stillCurrent()) return;
    if (outcome === 'refresh-failed') {
      logger.error('trade', 'Reserve refresh after a slippage rejection failed');
      reserves = 'failed';
      return;
    }
    if (outcome === 'requoted') {
      requoteNotice = pendingRequoteNotice;
      pendingRequoteNotice = null;
    } else if (outcome === 'unquoted') {
      // Say why nothing was traded, but never claim a refreshed quote.
      requoteNotice = SINGLE_SWAP_REJECTED_COPY;
      pendingRequoteNotice = null;
    }
  }

  async function retryReserveRefresh() {
    if (reserves === 'refreshing') return;
    const dialogGen = loadGeneration;
    const holder = currentContractId;
    const stillCurrent = () => dialogGen === loadGeneration && userState.contractId === holder;
    await recoverFromRejection(
      pendingRequoteNotice ?? SINGLE_SWAP_REQUOTE_NOTICE,
      stillCurrent
    );
  }

  function recomputeLimits() {
    ammBuyCap = computeAmmBuyCap(ammKaleBalance);
    maxBuyAmount = computeMaxBuy(ammKaleBalance, userKaleBalance);
    const sellCap = snapshot ? cometMaxIn(snapshot.mintRecord.balance) : userMintBalance;
    maxSellAmount = userMintBalance < sellCap ? userMintBalance : sellCap;

    if (mode === 'sell' && maxSellAmount <= 0n) {
      mode = 'buy';
    }
  }

  function scheduleSimulation() {
    simulationHook.scheduleSimulation(() => {
      void runSimulation();
    });
  }

  async function runSimulation() {
    if (!cometClient) return;
    // Never quote from a snapshot the pool already proved stale.
    if (reserves !== 'fresh') return;
    if (!currentContractId) {
      simulationError = 'Sign in to simulate trades.';
      return;
    }
    if (loading) return;
    const decimals = mode === 'buy' ? kaleDecimals : mintDecimals;
    const amount = parseInputToUnits(inputAmount, decimals);

    simulationLoading = false;
    simulationError = null;
    simulatedAmountOut = null;
    quotedFor = null;

    if (!amount || amount <= 0n) return;

    const maxIn = mode === 'buy' ? maxBuyAmount : maxSellAmount;
    if (maxIn <= 0n) {
      simulationError =
        mode === 'buy'
          ? `Insufficient ${kaleSymbol} balance to buy.`
          : `No ${DISPLAY_TOKEN_NAME} available to sell.`;
      return;
    }
    if (amount > maxIn) {
      simulationError = `Amount exceeds max ${mode === 'buy' ? 'buy' : 'sell'} limit.`;
      return;
    }

    if (!snapshot) return;
    const tokenIn = mode === 'buy' ? import.meta.env.PUBLIC_KALE_SAC_ID : snapshot.mintToken;
    const tokenOut = mode === 'buy' ? snapshot.mintToken : import.meta.env.PUBLIC_KALE_SAC_ID;

    lastSimulatedMode = mode;

    if (unsupportedPool) {
      simulationError = `${UNSUPPORTED_POOL_COPY}. Trading is paused for this song.`;
      return;
    }

    // Exact local quote from the ledger snapshot (zero RPC). Falls back to a
    // simulation only for pool versions the local math doesn't support.
    if (snapshot) {
      try {
        const local = quoteTrade(snapshot, mode, amount);
        if (local !== null) {
          simulationHook.invalidate();
          simulatedAmountOut = local;
          quotedFor = { mode, amount };
          return;
        }
      } catch (error) {
        simulationError =
          error instanceof CometQuoteError && error.issue === 'aboveMaxIn'
            ? `Amount exceeds max ${mode === 'buy' ? 'buy' : 'sell'} limit.`
            : 'Enter a smaller amount.';
        return;
      }
    }

    simulationLoading = true;
    // This simulation belongs to the holder, dialog load and request that
    // started it: once any changes (account switch, reload, newer input), its
    // result, error and loading cleanup never touch the current dialog.
    const simHolder = currentContractId;
    const dialogGen = loadGeneration;
    let simNonce = -1;
    const simMode = mode;
    const stillCurrent = () =>
      dialogGen === loadGeneration &&
      userState.contractId === simHolder &&
      simNonce === simulationHook.getCurrentNonce();

    try {
      const pending = simulationHook.runSimulation(cometClient, mode, amount, tokenIn, tokenOut, simHolder);
      simNonce = simulationHook.getCurrentNonce(); // taken synchronously by runSimulation
      const { amountOut } = await pending;
      if (!stillCurrent()) return;
      simulatedAmountOut = amountOut;
      quotedFor = amountOut !== null ? { mode: simMode, amount } : null;
    } catch (error) {
      logger.error('trade', 'Simulation failed', error);
      if (stillCurrent()) {
        simulationError = error instanceof Error ? error.message : 'Simulation failed.';
      }
    } finally {
      if (stillCurrent()) simulationLoading = false;
    }
  }

  $effect(() => {
    if (previousMode !== mode) {
      untrack(() => {
        previousMode = mode;
        inputAmount = '';
        invalidateQuote();
        requoteNotice = null;
        lastSimulatedMode = mode;
        simulationHook.clearTimer();
      });
    }
  });

  function onAmountInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    inputAmount = target.value;
    requoteNotice = null;
    // The shown quote / "Minimum received" belonged to the previous amount:
    // drop it NOW (submit stays disabled until the new amount's quote settles).
    invalidateQuote();
    scheduleSimulation();
  }

  async function executeSwap() {
    if (!cometClient || !snapshot || unsupportedPool) return;
    if (!currentContractId || !currentKeyId) {
      openAuthSheet('signin', 'Sign in to trade song tokens.');
      return;
    }

    const decimals = mode === 'buy' ? kaleDecimals : mintDecimals;
    const amount = parseInputToUnits(inputAmount, decimals);

    if (!amount || amount <= 0n) {
      simulationError = 'Enter a valid amount.';
      return;
    }

    const maxIn = mode === 'buy' ? maxBuyAmount : maxSellAmount;
    if (maxIn <= 0n) {
      simulationError =
        mode === 'buy'
          ? `Insufficient ${kaleSymbol} balance to buy.`
          : `No ${DISPLAY_TOKEN_NAME} available to sell.`;
      return;
    }
    if (amount > maxIn) {
      simulationError = `Amount exceeds max ${mode === 'buy' ? 'buy' : 'sell'} limit.`;
      return;
    }

    // Only a settled quote for EXACTLY this (mode, amount), from fresh reserves,
    // may be traded: its floor is the "Minimum received" the user is looking at.
    // (The button is disabled otherwise; this guards programmatic clicks.)
    if (
      !canSubmitTrade({
        mode,
        amount,
        quotedFor,
        quotedAmountOut: simulatedAmountOut,
        quoteLoading: simulationLoading,
        reserves,
        submitting,
      })
    ) {
      return;
    }
    const quotedAmountOut = simulatedAmountOut!;
    // The exact session (wallet, key, generation) this swap is for: if it
    // changes before build / prompt / relay, the swap aborts (never re-targets).
    const session = captureSessionTicket();
    if (!session || session.contractId !== currentContractId || session.keyId !== currentKeyId) return;

    submitting = true;
    simulationError = null;
    requoteNotice = null;

    // The dialog generation and wallet this swap belongs to: if either changes
    // before it settles (account switch, A→B→A), its completion, error and
    // pending state never touch (or close) the dialog now showing.
    const dialogGen = loadGeneration;
    const submittingHolder = currentContractId;
    const submittingMode = mode;
    const stillCurrent = () => dialogGen === loadGeneration && userState.contractId === submittingHolder;

    if (!snapshot || !cometClient) {
      submitting = false;
      return;
    }
    const tokenIn = submittingMode === 'buy' ? import.meta.env.PUBLIC_KALE_SAC_ID : snapshot.mintToken;
    const tokenOut = submittingMode === 'buy' ? snapshot.mintToken : import.meta.env.PUBLIC_KALE_SAC_ID;

    try {
      await executionHook.executeSwap({
        cometClient,
        tokenIn,
        tokenOut,
        amount,
        quotedAmountOut,
        session,
      });
      if (!stillCurrent()) return;

      await refreshAllBalances();
      if (!stillCurrent()) return;
      toast.success(submittingMode === 'buy' ? `Bought ${DISPLAY_TOKEN_NAME}.` : `Sold ${DISPLAY_TOKEN_NAME}.`);
      onComplete(userMintBalance);
    } catch (error) {
      logger.error('trade', 'Swap failed', error);
      if (!stillCurrent()) return;
      if (error instanceof SlippageExceededError) {
        // The pool refused a fill below the 1% floor: nothing was traded.
        // Re-read reserves + balances; re-quote the same input ONLY from a
        // successful read (a failed read keeps trading disabled, with Retry).
        await recoverFromRejection(error.message, stillCurrent);
        return;
      }
      simulationError = error instanceof Error ? error.message : 'Swap request failed.';
    } finally {
      if (stillCurrent()) submitting = false;
    }
  }

  /** The current input in base units (null when empty / invalid). */
  const currentAmount = $derived(parseInputToUnits(inputAmount, mode === 'buy' ? kaleDecimals : mintDecimals));
  const quoteIsCurrent = $derived(
    reserves === 'fresh' &&
    quoteMatchesInput({ mode, amount: currentAmount, quotedFor, quotedAmountOut: simulatedAmountOut })
  );
  const submitEnabled = $derived(
    canSubmitTrade({
      mode,
      amount: currentAmount,
      quotedFor,
      quotedAmountOut: simulatedAmountOut,
      quoteLoading: simulationLoading,
      reserves,
      submitting,
    })
  );

  const sellDisabled = $derived(maxSellAmount <= 0n);
  const actionLabel = $derived(
    submitting
      ? mode === 'buy'
        ? 'Buying…'
        : 'Selling…'
      : mode === 'buy'
        ? `Buy ${DISPLAY_TOKEN_NAME}`
        : `Sell ${DISPLAY_TOKEN_NAME}`
  );
  const maxBuyDisplay = $derived(formatAmount(maxBuyAmount, kaleDecimals));
  const maxSellDisplay = $derived(formatAmount(maxSellAmount, mintDecimals));
  const ammBuyCapDisplay = $derived(formatAmount(ammBuyCap, kaleDecimals));
  const userKaleDisplay = $derived(formatAmount(userKaleBalance, kaleDecimals));
  const userMintDisplay = $derived(formatAmount(userMintBalance, mintDecimals));
  const ammKaleDisplay = $derived(formatAmount(ammKaleBalance, kaleDecimals));
  const simulatedDisplay = $derived(
    simulatedAmountOut && quoteIsCurrent
      ? formatAmount(
          simulatedAmountOut,
          lastSimulatedMode === 'buy' ? mintDecimals : kaleDecimals
        )
      : '–'
  );
  const minimumReceivedDisplay = $derived(
    simulatedAmountOut && simulatedAmountOut > 0n && quoteIsCurrent
      ? formatAmount(
          minAmountOutFor(simulatedAmountOut),
          lastSimulatedMode === 'buy' ? mintDecimals : kaleDecimals
        )
      : null
  );
</script>

<Sheet
  {open}
  title={`Trade ${DISPLAY_TOKEN_NAME}`}
  subtitle={title}
  dismissible={!submitting}
  onClose={onClose}
>
  <div class="space-y-4">
    {#if imageUrl}
      <div class="flex items-center gap-3">
        <img
          src={imageUrl}
          alt=""
          class="size-12 shrink-0 rounded-[var(--radius-media)] object-cover pixelated ring-1 ring-inset ring-white/10"
        />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-ink-1">{title ?? DISPLAY_TOKEN_NAME}</p>
          <p class="font-mono text-xs text-ink-3 truncate">{songId.slice(0, 12)}…</p>
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="flex items-center justify-center py-10">
        <Loader classNames="size-7" textColor="text-accent" />
      </div>
    {:else if loadError}
      <div class="rounded-[var(--radius-control)] bg-danger/15 p-4 text-sm text-danger ring-1 ring-inset ring-danger/35">
        {loadError}
      </div>
    {:else if unsupportedPool}
      <div
        role="alert"
        class="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-warning/10 p-4 text-sm text-ink-1 ring-1 ring-inset ring-warning/35"
      >
        <span class="mt-0.5 font-semibold text-warning" aria-hidden="true">!</span>
        <div>
          <p class="font-medium">{UNSUPPORTED_POOL_COPY}</p>
          <p class="mt-0.5 text-xs text-ink-2">This song's market runs contract code SMOL hasn't verified, so trading is paused.</p>
        </div>
      </div>
    {:else}
      <TradeForm
        {mode}
        {inputAmount}
        {sellDisabled}
        {kaleSymbol}
        displayTokenName={DISPLAY_TOKEN_NAME}
        onModeChange={(newMode) => (mode = newMode)}
        {onAmountInput}
      />

      <TradeBalances
        {kaleSymbol}
        displayTokenName={DISPLAY_TOKEN_NAME}
        {userKaleDisplay}
        {userMintDisplay}
        {ammKaleDisplay}
        {ammBuyCapDisplay}
        {maxBuyDisplay}
        {maxSellDisplay}
      />

      <TradeSimulation
        {mode}
        {lastSimulatedMode}
        {simulatedDisplay}
        {minimumReceivedDisplay}
        {requoteNotice}
        reserveRefreshFailed={reserves === 'failed' ? RESERVE_REFRESH_FAILED_COPY : null}
        reserveRefreshing={reserves === 'refreshing'}
        onRetryReserveRefresh={retryReserveRefresh}
        {simulationLoading}
        {simulationError}
        {kaleSymbol}
        displayTokenName={DISPLAY_TOKEN_NAME}
      />
    {/if}
  </div>

  {#snippet footer()}
    {#if !loading && !loadError}
      {#if unsupportedPool}
        <Button variant="secondary" fullWidth disabled>{UNSUPPORTED_POOL_COPY}</Button>
      {:else if !currentContractId}
        <Button
          variant="primary"
          fullWidth
          onclick={() => openAuthSheet('signin', 'Sign in to trade song tokens.')}
        >
          Sign in to trade
        </Button>
      {:else}
        <Button
          variant="primary"
          fullWidth
          loading={submitting}
          disabled={submitting || !currentKeyId || !submitEnabled}
          onclick={executeSwap}
        >
          {actionLabel}
        </Button>
      {/if}
    {/if}
  {/snippet}
</Sheet>
