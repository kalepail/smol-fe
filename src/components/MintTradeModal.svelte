<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Sheet from './ui/Sheet.svelte';
  import Loader from './ui/Loader.svelte';
  import Button from './ui/Button.svelte';
  import TradeForm from './trade/TradeForm.svelte';
  import TradeBalances from './trade/TradeBalances.svelte';
  import TradeSimulation from './trade/TradeSimulation.svelte';
  import { userState } from '../stores/user.svelte';
  import { setKnownKaleBalance } from '../stores/balance.svelte';
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
  let currentKeyId = $derived(userState.keyId);

  const simulationHook = useTradeSimulation();
  const executionHook = useTradeExecution();

  onMount(() => {
    void initialize();
    return () => {
      simulationHook.clearTimer();
    };
  });

  function applySnapshot(next: CometTradeSnapshot) {
    snapshot = next;
    // The pool's KALE *reserve* (AllRecordData) bounds a buy, not its SAC balance.
    ammKaleBalance = next.kaleRecord.balance;
    userKaleBalance = next.userKale ?? 0n;
    userMintBalance = next.userMint ?? 0n;
    if (currentContractId && next.userKale !== null) {
      setKnownKaleBalance(currentContractId, next.userKale);
    }
    recomputeLimits();
  }

  async function initialize() {
    loading = true;
    loadError = null;
    simulationError = null;
    simulatedAmountOut = null;
    try {
      if (!ammId || !mintTokenId) {
        throw new Error('Missing AMM configuration.');
      }

      cometClient = new CometClient({
        contractId: ammId,
        rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
        networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
      });

      // ONE getLedgerEntries: pool instance + reserves + user KALE + user song tokens.
      applySnapshot(
        await readCometTradeSnapshot({ pool: ammId, mintToken: mintTokenId, holder: currentContractId })
      );
    } catch (error) {
      logger.error('trade', error);
      loadError = error instanceof Error ? error.message : 'Failed to load trading data.';
    } finally {
      loading = false;
    }
  }

  async function refreshAllBalances() {
    try {
      applySnapshot(
        await readCometTradeSnapshot({ pool: ammId, mintToken: mintTokenId, holder: currentContractId })
      );
    } catch (error) {
      logger.error('trade', 'Failed to refresh trade balances', error);
    }
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

    const tokenIn = mode === 'buy' ? import.meta.env.PUBLIC_KALE_SAC_ID : mintTokenId;
    const tokenOut = mode === 'buy' ? mintTokenId : import.meta.env.PUBLIC_KALE_SAC_ID;

    lastSimulatedMode = mode;

    // Exact local quote from the ledger snapshot (zero RPC). Falls back to a
    // simulation only for pool versions the local math doesn't support.
    if (snapshot) {
      try {
        const local = quoteTrade(snapshot, mode, amount);
        if (local !== null) {
          simulationHook.invalidate();
          simulatedAmountOut = local;
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

    try {
      const { amountOut, nonce } = await simulationHook.runSimulation(
        cometClient,
        mode,
        amount,
        tokenIn,
        tokenOut,
        currentContractId
      );

      if (nonce !== simulationHook.getCurrentNonce()) return;
      simulatedAmountOut = amountOut;
    } catch (error) {
      logger.error('trade', 'Simulation failed', error);
      if (simulationHook.getCurrentNonce()) {
        simulationError = error instanceof Error ? error.message : 'Simulation failed.';
      }
    } finally {
      simulationLoading = false;
    }
  }

  $effect(() => {
    if (previousMode !== mode) {
      untrack(() => {
        previousMode = mode;
        inputAmount = '';
        simulationError = null;
        simulatedAmountOut = null;
        lastSimulatedMode = mode;
        simulationHook.clearTimer();
      });
    }
  });

  function onAmountInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    inputAmount = target.value;
    scheduleSimulation();
  }

  async function executeSwap() {
    if (!cometClient) return;
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

    submitting = true;
    simulationError = null;

    const tokenIn = mode === 'buy' ? import.meta.env.PUBLIC_KALE_SAC_ID : mintTokenId;
    const tokenOut = mode === 'buy' ? mintTokenId : import.meta.env.PUBLIC_KALE_SAC_ID;

    try {
      await executionHook.executeSwap({
        cometClient,
        tokenIn,
        tokenOut,
        amount,
        userContractId: currentContractId,
        userKeyId: currentKeyId,
      });

      await refreshAllBalances();
      toast.success(mode === 'buy' ? `Bought ${DISPLAY_TOKEN_NAME}.` : `Sold ${DISPLAY_TOKEN_NAME}.`);
      onComplete(userMintBalance);
    } catch (error) {
      logger.error('trade', 'Swap failed', error);
      simulationError = error instanceof Error ? error.message : 'Swap request failed.';
    } finally {
      submitting = false;
    }
  }

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
    simulatedAmountOut
      ? formatAmount(
          simulatedAmountOut,
          lastSimulatedMode === 'buy' ? mintDecimals : kaleDecimals
        )
      : '–'
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
        {simulationLoading}
        {simulationError}
        {kaleSymbol}
        displayTokenName={DISPLAY_TOKEN_NAME}
      />
    {/if}
  </div>

  {#snippet footer()}
    {#if !loading && !loadError}
      {#if !currentContractId}
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
          disabled={submitting || !currentKeyId || !inputAmount.trim()}
          onclick={executeSwap}
        >
          {actionLabel}
        </Button>
      {/if}
    {/if}
  {/snippet}
</Sheet>
