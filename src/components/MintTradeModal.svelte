<script lang="ts">
  import { createEventDispatcher, onMount, untrack } from "svelte";
  import Loader from "./ui/Loader.svelte";
  import TradeForm from "./trade/TradeForm.svelte";
  import TradeBalances from "./trade/TradeBalances.svelte";
  import TradeSimulation from "./trade/TradeSimulation.svelte";
  import { userState } from "../stores/user.svelte.ts";
  import { updateContractBalance } from "../stores/balance.svelte.ts";
  import { kale, sac } from "../utils/passkey-kit";
  import { Client as CometClient } from "comet-sdk";
  import { useTradeSimulation } from "../hooks/useTradeSimulation";
  import { useTradeExecution } from "../hooks/useTradeExecution";
  import {
    computeAmmBuyCap,
    computeMaxBuy,
    formatAmount,
    parseInputToUnits,
  } from "../utils/tradeCalculations";
  import { RPC_URL } from "../utils/rpc";
  import { Turnstile } from "svelte-turnstile";

  const DISPLAY_TOKEN_NAME = "SMOL";

  interface Props {
    ammId: string;
    mintTokenId: string;
    songId: string;
    title?: string;
    imageUrl?: string;
    fallbackImage?: string;
  }

  let { ammId, mintTokenId, songId, title, imageUrl, fallbackImage }: Props =
    $props();

  const dispatch = createEventDispatcher();

  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let mode = $state<"buy" | "sell">("buy");
  let previousMode = $state<"buy" | "sell">("buy");
  let inputAmount = $state("");
  let submitting = $state(false);

  let simulationLoading = $state(false);
  let simulationError = $state<string | null>(null);
  let simulatedAmountOut = $state<bigint | null>(null);
  let lastSimulatedMode = $state<"buy" | "sell">("buy");

  let cometClient = $state<CometClient | null>(null);
  let mintTokenClient = $state<any>(null);

  let kaleDecimals = $state(7);
  let mintDecimals = $state(7);
  let kaleSymbol = $state("KALE");

  let ammKaleBalance = $state<bigint>(0n);
  let userKaleBalance = $state<bigint>(0n);
  let userMintBalance = $state<bigint>(0n);

  let maxBuyAmount = $state<bigint>(0n);
  let ammBuyCap = $state<bigint>(0n);
  let maxSellAmount = $state<bigint>(0n);
  let turnstileToken = $state("");

  // Derive current user state directly instead of copying to local state
  let currentContractId = $derived(userState.contractId);
  let currentKeyId = $derived(userState.keyId);

  const simulationHook = useTradeSimulation();
  const executionHook = useTradeExecution();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    void initialize();

    return () => {
      simulationHook.clearTimer();
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  async function initialize() {
    loading = true;
    loadError = null;
    simulationError = null;
    simulatedAmountOut = null;
    try {
      if (!currentContractId) {
        throw new Error("Please login to use the trade feature.");
      }

      if (!ammId || !mintTokenId) {
        throw new Error("Missing AMM configuration.");
      }

      // Final safety check for missing env vars
      if (!import.meta.env.PUBLIC_KALE_SAC_ID) {
        throw new Error(
          "Blockchain configuration is missing (Missing KALE SAC ID).",
        );
      }

      cometClient = new CometClient({
        contractId: ammId,
        rpcUrl: RPC_URL,
        networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE!,
      });

      mintTokenClient = sac.get().getSACClient(mintTokenId);

      const [
        { result: kaleDecRes },
        { result: mintDecRes },
        { result: ammBalanceRes },
      ] = await Promise.all([
        kale.get().decimals(),
        mintTokenClient.decimals(),
        kale.get().balance({ id: ammId }),
      ]);

      kaleDecimals = Number(kaleDecRes);
      mintDecimals = Number(mintDecRes);
      ammKaleBalance = ammBalanceRes;

      if (currentContractId) {
        await refreshUserBalances();
      } else {
        userKaleBalance = 0n;
        userMintBalance = 0n;
      }

      recomputeLimits();
    } catch (error) {
      console.error(error);
      loadError =
        error instanceof Error ? error.message : "Failed to load trading data.";
    } finally {
      loading = false;
    }
  }

  async function refreshUserBalances() {
    if (!currentContractId || !mintTokenClient) return;

    try {
      const [{ result: kaleResult }, { result: mintResult }] =
        await Promise.all([
          kale.get().balance({ id: currentContractId }),
          mintTokenClient.balance({ id: currentContractId }),
        ]);
      userKaleBalance = kaleResult;
      userMintBalance = mintResult;
    } catch (error) {
      console.error("Failed to refresh balances", error);
    }
  }

  async function refreshAllBalances() {
    if (!mintTokenClient) return;
    const promises: Promise<void>[] = [];

    promises.push(
      kale
        .get()
        .balance({ id: ammId })
        .then(({ result }) => {
          ammKaleBalance = result;
        })
        .catch((error) => {
          console.error("Failed to refresh AMM balance", error);
        }),
    );

    if (currentContractId) {
      promises.push(
        Promise.all([
          kale.get().balance({ id: currentContractId }),
          mintTokenClient.balance({ id: currentContractId }),
        ])
          .then(([{ result: kaleResult }, { result: mintResult }]) => {
            userKaleBalance = kaleResult;
            userMintBalance = mintResult;
          })
          .catch((error) => {
            console.error("Failed to refresh user balances", error);
          }),
      );
    }

    await Promise.all(promises);
    recomputeLimits();
  }

  function recomputeLimits() {
    ammBuyCap = computeAmmBuyCap(ammKaleBalance);
    maxBuyAmount = computeMaxBuy(ammKaleBalance, userKaleBalance);
    maxSellAmount = userMintBalance;

    if (mode === "sell" && maxSellAmount <= 0n) {
      mode = "buy";
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
      simulationError = "Connect your wallet to simulate trades.";
      return;
    }
    if (loading) return;
    const decimals = mode === "buy" ? kaleDecimals : mintDecimals;
    const amount = parseInputToUnits(inputAmount, decimals);

    simulationLoading = false;
    simulationError = null;
    simulatedAmountOut = null;

    if (!amount || amount <= 0n) {
      return;
    }

    const maxIn = mode === "buy" ? maxBuyAmount : maxSellAmount;
    if (maxIn <= 0n) {
      simulationError =
        mode === "buy"
          ? `Insufficient ${kaleSymbol} balance to buy.`
          : `No ${DISPLAY_TOKEN_NAME} available to sell.`;
      return;
    }
    if (amount > maxIn) {
      simulationError = `Amount exceeds max ${mode === "buy" ? "buy" : "sell"} limit.`;
      return;
    }

    const tokenIn =
      mode === "buy" ? import.meta.env.PUBLIC_KALE_SAC_ID : mintTokenId;
    const tokenOut =
      mode === "buy" ? mintTokenId : import.meta.env.PUBLIC_KALE_SAC_ID;

    simulationLoading = true;
    lastSimulatedMode = mode;

    try {
      const { amountOut, nonce } = await simulationHook.runSimulation(
        cometClient,
        mode,
        amount,
        tokenIn,
        tokenOut,
        currentContractId,
      );

      if (nonce !== simulationHook.getCurrentNonce()) return;

      simulatedAmountOut = amountOut;
    } catch (error) {
      console.error("Simulation failed", error);
      if (simulationHook.getCurrentNonce()) {
        simulationError =
          error instanceof Error ? error.message : "Simulation failed.";
      }
    } finally {
      simulationLoading = false;
    }
  }

  $effect(() => {
    if (previousMode !== mode) {
      untrack(() => {
        previousMode = mode;
        inputAmount = "";
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

  function handleImageError(event: Event) {
    if (!fallbackImage) return;
    const target = event.currentTarget as HTMLImageElement;
    target.src = fallbackImage;
  }

  async function executeSwap() {
    if (!cometClient || !mintTokenClient) return;
    if (!currentContractId || !currentKeyId) {
      simulationError = "Connect your wallet before trading.";
      return;
    }

    const decimals = mode === "buy" ? kaleDecimals : mintDecimals;
    const amount = parseInputToUnits(inputAmount, decimals);

    if (!amount || amount <= 0n) {
      simulationError = "Enter a valid amount.";
      return;
    }

    const maxIn = mode === "buy" ? maxBuyAmount : maxSellAmount;
    if (maxIn <= 0n) {
      simulationError =
        mode === "buy"
          ? `Insufficient ${kaleSymbol} balance to buy.`
          : `No ${DISPLAY_TOKEN_NAME} available to sell.`;
      return;
    }
    if (amount > maxIn) {
      simulationError = `Amount exceeds max ${mode === "buy" ? "buy" : "sell"} limit.`;
      return;
    }

    if (!turnstileToken) {
      simulationError = "Please complete the CAPTCHA.";
      return;
    }

    submitting = true;
    simulationError = null;

    const tokenIn =
      mode === "buy" ? import.meta.env.PUBLIC_KALE_SAC_ID : mintTokenId;
    const tokenOut =
      mode === "buy" ? mintTokenId : import.meta.env.PUBLIC_KALE_SAC_ID;

    try {
      const expectedOut = await executionHook.executeSwap({
        tokenIn,
        tokenOut,
        amount,
        userContractId: currentContractId,
        userKeyId: currentKeyId,
        turnstileToken,
      });

      await refreshAllBalances();
      if (currentContractId) {
        await updateContractBalance(currentContractId);
      }

      dispatch("complete", {
        side: mode,
        amountIn: amount,
        amountOut: expectedOut,
      });

      close();
    } catch (error) {
      console.error("Swap failed", error);
      simulationError =
        error instanceof Error ? error.message : "Swap request failed.";
    } finally {
      submitting = false;
    }
  }

  function close() {
    dispatch("close");
  }

  const sellDisabled = $derived(maxSellAmount <= 0n);
  const actionLabel = $derived(
    submitting
      ? mode === "buy"
        ? "Buying..."
        : "Selling..."
      : mode === "buy"
        ? `Buy ${DISPLAY_TOKEN_NAME}`
        : `Sell ${DISPLAY_TOKEN_NAME}`,
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
          lastSimulatedMode === "buy" ? mintDecimals : kaleDecimals,
        )
      : "–",
  );
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
  onclick={close}
>
  <div
    class="w-full max-w-lg rounded-lg bg-slate-900 p-6 text-slate-100 shadow-xl"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="mb-4 flex items-start">
      {#if imageUrl}
        <img
          src={imageUrl}
          alt={title ?? DISPLAY_TOKEN_NAME}
          class="h-12 w-12 flex-shrink-0 rounded object-cover"
          onerror={handleImageError}
        />
      {/if}
      <div class="ml-3 mr-auto">
        <h2 class="text-lg font-semibold">Trade {DISPLAY_TOKEN_NAME}</h2>
        {#if title}
          <p class="text-sm text-slate-400">{title}</p>
        {/if}
      </div>
      <button
        class="rounded bg-slate-800 px-2 py-1 text-sm hover:bg-slate-700"
        onclick={close}
        aria-label="Close trade dialog"
      >
        ×
      </button>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-10">
        <Loader classNames=" text-lime-400 w-8 h-8" />
      </div>
    {:else if loadError}
      <div
        class="rounded border border-rose-500 bg-rose-500/10 p-4 text-sm text-rose-200"
      >
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

      <div class="space-y-4 mt-4">
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

        <div class="flex justify-center -mb-2">
          <Turnstile
            siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
            on:callback={(e) => {
              turnstileToken = e.detail.token;
            }}
            on:expired={() => {
              turnstileToken = "";
            }}
            theme="dark"
          />
        </div>

        <button
          class="w-full rounded bg-lime-500 px-4 py-2 text-base font-semibold text-slate-900 hover:bg-lime-400 disabled:opacity-60"
          onclick={executeSwap}
          disabled={submitting ||
            !currentContractId ||
            !currentKeyId ||
            !inputAmount.trim() ||
            loading ||
            !turnstileToken}
        >
          {actionLabel}
        </button>

        {#if !currentContractId}
          <p class="text-center text-xs text-slate-400">
            Connect your wallet to place a trade.
          </p>
        {/if}
      </div>
    {/if}
  </div>
</div>
