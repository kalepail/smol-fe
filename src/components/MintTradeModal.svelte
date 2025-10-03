<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { get } from "svelte/store";
    import Loader from "./Loader.svelte";
    import { contractId } from "../store/contractId";
    import { keyId } from "../store/keyId";
    import { updateContractBalance } from "../store/contractBalance";
    import { kale, sac, account, server } from "../utils/passkey-kit";
    import { Client as CometClient } from "comet-sdk";
    import { rpc } from "../utils/base";
    import { getDomain } from "tldts";

    const MAX_PRICE = 170141183460469231731687303715884105727n;
    const BUY_CAP_NUMERATOR = 3333334n;
    const BUY_CAP_DENOMINATOR = 10000000n;
    const DISPLAY_TOKEN_NAME = "SMOL";

    export let ammId: string;
    export let mintTokenId: string;
    export let songId: string;
    export let title: string | undefined;
    export let imageUrl: string | undefined;
    export let fallbackImage: string | undefined;

    const dispatch = createEventDispatcher();

    let loading = true;
    let loadError: string | null = null;

    let mode: "buy" | "sell" = "buy";
    let previousMode: "buy" | "sell" = mode;
    let inputAmount = "";
    let submitting = false;

    let simulationTimer: ReturnType<typeof setTimeout> | null = null;
    let simulationLoading = false;
    let simulationError: string | null = null;
    let simulatedAmountOut: bigint | null = null;
    let lastSimulatedMode: "buy" | "sell" = mode;

    let cometClient: CometClient | null = null;
    let mintTokenClient: ReturnType<typeof sac.getSACClient> | null = null;

    let kaleDecimals = 7;
    let mintDecimals = 7;
    let kaleSymbol = "KALE";

    let ammKaleBalance: bigint = 0n;
    let userKaleBalance: bigint = 0n;
    let userMintBalance: bigint = 0n;

    let maxBuyAmount: bigint = 0n;
    let ammBuyCap: bigint = 0n;
    let maxSellAmount: bigint = 0n;

    let simulationNonce = 0;

    let currentContractId: string | null = get(contractId);
    let currentKeyId: string | null = get(keyId);

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    }

    onMount(() => {
        const unsubContract = contractId.subscribe((value) => {
            currentContractId = value;
        });
        const unsubKey = keyId.subscribe((value) => {
            currentKeyId = value;
        });

        window.addEventListener("keydown", handleKeydown);
        void initialize();

        return () => {
            if (simulationTimer) {
                clearTimeout(simulationTimer);
                simulationTimer = null;
            }
            window.removeEventListener("keydown", handleKeydown);
            unsubContract();
            unsubKey();
        };
    });

    async function initialize() {
        loading = true;
        loadError = null;
        simulationError = null;
        simulatedAmountOut = null;
        try {
            if (!ammId || !mintTokenId) {
                throw new Error("Missing AMM configuration.");
            }

            cometClient = new CometClient({
                contractId: ammId,
                rpcUrl: import.meta.env.PUBLIC_RPC_URL,
                networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
            });

            mintTokenClient = sac.getSACClient(mintTokenId);

            const [
                { result: kaleDecRes },
                { result: mintDecRes },
                { result: ammBalanceRes },
            ] = await Promise.all([
                kale.decimals(),
                mintTokenClient.decimals(),
                kale.balance({ id: ammId }),
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
            const [
                { result: kaleResult },
                { result: mintResult },
            ] = await Promise.all([
                kale.balance({ id: currentContractId }),
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
                    kale.balance({ id: currentContractId }),
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
        ammBuyCap = computeAmmBuyCap();
        maxBuyAmount = computeMaxBuy();
        maxSellAmount = userMintBalance;

        if (mode === "sell" && maxSellAmount <= 0n) {
            mode = "buy";
        }
    }

    function computeAmmBuyCap(): bigint {
        if (ammKaleBalance <= 0n) return 0n;
        return (ammKaleBalance * BUY_CAP_NUMERATOR) / BUY_CAP_DENOMINATOR;
    }

    function computeMaxBuy(): bigint {
        if (ammKaleBalance <= 0n) return 0n;
        const cap = computeAmmBuyCap();
        if (userKaleBalance <= 0n) {
            return 0n;
        }
        return userKaleBalance < cap ? userKaleBalance : cap;
    }

    function formatAmount(value: bigint, decimals: number): string {
        const negative = value < 0n;
        const absolute = negative ? -value : value;
        const scale = BigInt(decimals);
        if (scale === 0n) {
            return `${negative ? "-" : ""}${absolute.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
        }
        const divider = 10n ** scale;
        const integerPart = absolute / divider;
        const fractionPart = absolute % divider;
        let fraction = fractionPart.toString().padStart(decimals, "0");
        fraction = fraction.replace(/0+$/, "");
        const integerWithCommas = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return `${negative ? "-" : ""}${integerWithCommas}${fraction ? `.${fraction}` : ""}`;
    }

    function parseInputToUnits(value: string, decimals: number): bigint | null {
        const sanitized = value.replace(/,/g, "").trim();
        if (!sanitized) return null;
        if (!/^\d*(?:\.\d*)?$/.test(sanitized)) return null;
        const [wholePart = "", fractionPart = ""] = sanitized.split(".");
        if (!wholePart && !fractionPart) return null;
        if (fractionPart.length > decimals) return null;
        const paddedFraction = (fractionPart + "0".repeat(decimals)).slice(0, decimals);
        const combined = `${wholePart || "0"}${paddedFraction}`.replace(/^0+(\d)/, "$1");
        return BigInt(combined || "0");
    }

    function scheduleSimulation() {
        if (simulationTimer) {
            clearTimeout(simulationTimer);
        }
        simulationTimer = setTimeout(() => {
            simulationTimer = null;
            void runSimulation();
        }, 1000);
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
            simulationError = mode === "buy"
                ? `Insufficient ${kaleSymbol} balance to buy.`
                : `No ${DISPLAY_TOKEN_NAME} available to sell.`;
            return;
        }
        if (amount > maxIn) {
            simulationError = `Amount exceeds max ${mode === "buy" ? "buy" : "sell"} limit.`;
            return;
        }

        const tokenIn = mode === "buy" ? import.meta.env.PUBLIC_KALE_SAC_ID : mintTokenId;
        const tokenOut = mode === "buy" ? mintTokenId : import.meta.env.PUBLIC_KALE_SAC_ID;

        const localNonce = ++simulationNonce;
        simulationLoading = true;
        lastSimulatedMode = mode;

        try {
            const tx = await cometClient.swap_exact_amount_in({
                token_in: tokenIn,
                token_amount_in: amount,
                token_out: tokenOut,
                min_amount_out: 0n,
                max_price: MAX_PRICE,
                user: currentContractId,
                trade_recipients: undefined,
            });

            if (localNonce !== simulationNonce) return;

            const [amountOut] = tx.result ?? [];
            simulatedAmountOut = amountOut ?? null;
        } catch (error) {
            console.error("Simulation failed", error);
            if (localNonce === simulationNonce) {
                simulationError =
                    error instanceof Error ? error.message : "Simulation failed.";
            }
        } finally {
            if (localNonce === simulationNonce) {
                simulationLoading = false;
            }
        }
    }

    $: {
        if (previousMode !== mode) {
            previousMode = mode;
            inputAmount = "";
            simulationError = null;
            simulatedAmountOut = null;
            lastSimulatedMode = mode;
            if (simulationTimer) {
                clearTimeout(simulationTimer);
                simulationTimer = null;
            }
        }
    }

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
            simulationError = mode === "buy"
                ? `Insufficient ${kaleSymbol} balance to buy.`
                : `No ${DISPLAY_TOKEN_NAME} available to sell.`;
            return;
        }
        if (amount > maxIn) {
            simulationError = `Amount exceeds max ${mode === "buy" ? "buy" : "sell"} limit.`;
            return;
        }

        submitting = true;
        simulationError = null;

        const tokenIn = mode === "buy" ? import.meta.env.PUBLIC_KALE_SAC_ID : mintTokenId;
        const tokenOut = mode === "buy" ? mintTokenId : import.meta.env.PUBLIC_KALE_SAC_ID;

        try {
            const tx = await cometClient.swap_exact_amount_in({
                token_in: tokenIn,
                token_amount_in: amount,
                token_out: tokenOut,
                min_amount_out: 0n,
                max_price: MAX_PRICE,
                user: currentContractId,
                trade_recipients: undefined,
            });

            const [expectedOut] = tx.result ?? [];

            const { sequence } = await rpc.getLatestLedger();
            await account.sign(tx, {
                rpId: getDomain(window.location.hostname) ?? undefined,
                keyId: currentKeyId,
                expiration: sequence + 60,
            });

            await server.send(tx);

            await refreshAllBalances();
            if (currentContractId) {
                await updateContractBalance(currentContractId);
            }

            dispatch("complete", {
                side: mode,
                amountIn: amount,
                amountOut: expectedOut ?? null,
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

    const modalClick = (event: MouseEvent) => {
        event.stopPropagation();
    };

    $: sellDisabled = maxSellAmount <= 0n;
    $: actionLabel = submitting
        ? mode === "buy" ? "Buying..." : "Selling..."
        : mode === "buy" ? `Buy ${DISPLAY_TOKEN_NAME}` : `Sell ${DISPLAY_TOKEN_NAME}`;
    $: maxBuyDisplay = formatAmount(maxBuyAmount, kaleDecimals);
    $: maxSellDisplay = formatAmount(maxSellAmount, mintDecimals);
    $: ammBuyCapDisplay = formatAmount(ammBuyCap, kaleDecimals);
    $: userKaleDisplay = formatAmount(userKaleBalance, kaleDecimals);
    $: userMintDisplay = formatAmount(userMintBalance, mintDecimals);
    $: ammKaleDisplay = formatAmount(ammKaleBalance, kaleDecimals);
    $: simulatedDisplay = simulatedAmountOut
        ? formatAmount(
              simulatedAmountOut,
              lastSimulatedMode === "buy" ? mintDecimals : kaleDecimals,
          )
        : "–";
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" on:click={close}>
    <div
        class="w-full max-w-lg rounded-lg bg-slate-900 p-6 text-slate-100 shadow-xl"
        on:click|stopPropagation={modalClick}
    >
        <div class="mb-4 flex items-start">
            {#if imageUrl}
                <img
                    src={imageUrl}
                    alt={title ?? DISPLAY_TOKEN_NAME}
                    class="h-12 w-12 flex-shrink-0 rounded object-cover"
                    on:error={handleImageError}
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
                on:click={close}
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
            <div class="rounded border border-rose-500 bg-rose-500/10 p-4 text-sm text-rose-200">
                {loadError}
            </div>
        {:else}
            <div class="mb-4 flex gap-2">
                <button
                    class={`flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors ${
                        mode === "buy"
                            ? "bg-lime-500 text-slate-900"
                            : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                    on:click={() => (mode = "buy")}
                    disabled={mode === "buy"}
                >
                    Buy
                </button>
                <button
                    class={`flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors ${
                        mode === "sell" && !sellDisabled
                            ? "bg-rose-400 text-slate-900"
                            : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    } ${sellDisabled ? "opacity-50" : ""}`}
                    on:click={() => (mode = "sell")}
                    disabled={sellDisabled}
                >
                    Sell
                </button>
            </div>

            {#if sellDisabled}
                <p class="mb-4 text-xs text-slate-400">
                    You don't hold any {DISPLAY_TOKEN_NAME} yet, so selling is disabled.
                </p>
            {/if}

            <div class="space-y-4">
                <label class="block text-sm font-medium">
                    Amount to {mode === "buy" ? "spend" : "sell"}
                    <input
                        class="mt-2 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-base focus:border-lime-500 focus:outline-none"
                        type="text"
                        inputmode="decimal"
                        placeholder={mode === "buy"
                            ? `0.0 ${kaleSymbol}`
                            : `0.0 ${DISPLAY_TOKEN_NAME}`}
                        value={inputAmount}
                        on:input={onAmountInput}
                        autocomplete="off"
                    />
                </label>

                <div class="grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <div>
                        <strong class="text-slate-200">Your {kaleSymbol}:</strong>
                        <div>{userKaleDisplay} {kaleSymbol}</div>
                    </div>
                    <div>
                        <strong class="text-slate-200">Your {DISPLAY_TOKEN_NAME}:</strong>
                        <div>{userMintDisplay} {DISPLAY_TOKEN_NAME}</div>
                    </div>
                    <div>
                        <strong class="text-slate-200">AMM {kaleSymbol} Reserve:</strong>
                        <div>{ammKaleDisplay} {kaleSymbol}</div>
                    </div>
                    <div>
                        <strong class="text-slate-200">AMM Buy Cap (33.33334%):</strong>
                        <div>{ammBuyCapDisplay} {kaleSymbol}</div>
                    </div>
                </div>

                <div class="rounded border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-300">
                    <div>
                        <strong>Max buy (min of cap &amp; your balance):</strong>
                        <span class="ml-2 text-slate-100">{maxBuyDisplay} {kaleSymbol}</span>
                    </div>
                    <div>
                        <strong>Max sell:</strong>
                        <span class="ml-2 text-slate-100">{maxSellDisplay} {DISPLAY_TOKEN_NAME}</span>
                    </div>
                </div>

                <div class="rounded border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">
                    <div class="flex items-center justify-between">
                        <span>Simulated {mode === "buy" ? DISPLAY_TOKEN_NAME : kaleSymbol} received:</span>
                        {#if simulationLoading}
                            <Loader classNames=" text-lime-400 w-5 h-5" />
                        {:else}
                            <span class="font-semibold text-lime-300">{simulatedDisplay}</span>
                        {/if}
                    </div>
                    {#if lastSimulatedMode !== mode}
                        <div class="mt-1 text-xs text-slate-400">
                            Re-run simulation after switching modes.
                        </div>
                    {/if}
                    {#if simulationError}
                        <div class="mt-2 rounded border border-rose-500 bg-rose-500/10 p-2 text-xs text-rose-200">
                            {simulationError}
                        </div>
                    {/if}
                </div>

                <button
                    class="w-full rounded bg-lime-500 px-4 py-2 text-base font-semibold text-slate-900 hover:bg-lime-400 disabled:opacity-60"
                    on:click={executeSwap}
                    disabled={
                        submitting ||
                        !currentContractId ||
                        !currentKeyId ||
                        !inputAmount.trim() ||
                        loading
                    }
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
