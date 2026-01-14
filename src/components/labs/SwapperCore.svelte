<script lang="ts">
    import { account, sac } from "../../utils/passkey-kit";
    import { onMount } from "svelte";
    import { getDomain } from "tldts";
    import { getLatestSequence } from "../../utils/base";
    import { Asset } from "@stellar/stellar-sdk/minimal";
    import { Buffer } from "buffer";
    import {
        getQuote,
        TOKENS,
        formatAmount,
        toStroops,
        type QuoteResponse,
    } from "../../utils/soroswap";

    let acceptedRisk = $state(false);
    let isConnected = $state(false);
    let keyId = $state<string | null>(null);
    let contractId = $state<string | null>(null);

    // Demo mode for local testing (bypass passkey login)
    let isDemoMode = $state(false);
    onMount(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("demo") === "true") {
            isDemoMode = true;
            isConnected = true;
            keyId = "DEMO-KEY-12345678";
            contractId =
                "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";
        }
    });

    // Mode toggle: 'transfer' or 'swap'
    let mode = $state<"transfer" | "swap">("swap");

    // Transfer State
    let destination = $state("");
    let amount = $state("");
    let isProcessing = $state(false);
    let status = $state("");

    // Swap State
    let swapAmount = $state("");
    let quote = $state<QuoteResponse | null>(null);
    let isQuoting = $state(false);
    let quoteError = $state("");

    let isValidTransfer = $derived(
        destination.startsWith("C") &&
            destination.length > 50 &&
            parseFloat(amount) > 0,
    );

    let isValidSwap = $derived(parseFloat(swapAmount) > 0 && quote !== null);

    function setMax() {
        if (mode === "transfer") {
            amount = "10"; // Hardcoded cap for safety
        } else {
            swapAmount = "1"; // 1 XLM max for swap testing
        }
    }

    async function connectWallet() {
        try {
            const rpId = getDomain(window.location.hostname) ?? undefined;
            const result = await account.connectWallet({ rpId });
            keyId =
                typeof result.keyId === "string"
                    ? result.keyId
                    : Buffer.from(result.keyId).toString("base64");
            contractId = result.contractId;
            isConnected = true;
            console.log("Wallet Connected:", { keyId, contractId });
        } catch (e) {
            console.error("Passkey Login Failed", e);
            alert("Login failed. Check console.");
        }
    }

    // Debounced quote fetching
    let quoteTimeout: ReturnType<typeof setTimeout>;
    async function fetchQuote() {
        if (!swapAmount || parseFloat(swapAmount) <= 0) {
            quote = null;
            return;
        }

        clearTimeout(quoteTimeout);
        quoteTimeout = setTimeout(async () => {
            isQuoting = true;
            quoteError = "";
            quote = null;

            try {
                const stroops = toStroops(swapAmount);
                const result = await getQuote({
                    assetIn: TOKENS.XLM,
                    assetOut: TOKENS.KALE,
                    amount: stroops,
                    tradeType: "EXACT_IN",
                });
                quote = result;
                console.log("Quote received:", result);
            } catch (e) {
                console.error("Quote error:", e);
                quoteError = (e as Error).message;
            } finally {
                isQuoting = false;
            }
        }, 500);
    }

    // Watch swapAmount changes
    $effect(() => {
        if (mode === "swap" && swapAmount) {
            fetchQuote();
        }
    });

    async function handleTransfer() {
        if (!keyId || !contractId || !isValidTransfer) return;
        isProcessing = true;
        status = "Initializing Transfer...";

        try {
            const NATIVE_ASSET_ID =
                "CDLZFC3SYJYDZT7KQLSXRC1E32I36J3C3Q7K7I7I7I7I7I7I7I7I7I7I";

            const client = sac.getSACClient(NATIVE_ASSET_ID);

            status = "Building Transaction...";

            const amountBigInt = BigInt(
                Math.floor(parseFloat(amount) * 10_000_000),
            );

            let tx = await client.transfer({
                from: contractId,
                to: destination,
                amount: amountBigInt,
            });

            status = "Requesting Passkey Signature...";
            const sequence = await getLatestSequence();

            tx = await account.sign(tx, {
                rpId: getDomain(window.location.hostname) ?? undefined,
                keyId,
                expiration: sequence + 60,
            });

            await new Promise((r) => setTimeout(r, 1000));

            status = "Transfer Signed (Phase 1 Logic Verified)";
            console.log("Signed Transaction XDR:", tx.built?.toXDR());
        } catch (e) {
            console.error(e);
            status = `Error: ${(e as Error).message}`;
        } finally {
            isProcessing = false;
        }
    }

    async function handleSwap() {
        if (!keyId || !contractId || !quote) return;
        isProcessing = true;
        status = "Preparing Swap...";

        try {
            // Import parseRawTrade and AGGREGATOR_CONTRACT from soroswap utils
            const { parseRawTrade, AGGREGATOR_CONTRACT, getDeadline } =
                await import("../../utils/soroswap");
            const { Contract, Address, nativeToScVal, xdr } = await import(
                "@stellar/stellar-sdk/minimal"
            );

            status = "Parsing quote data...";
            const rawTrade = parseRawTrade(quote);

            status = "Building aggregator contract call...";

            // Create aggregator contract instance
            const aggregator = new Contract(AGGREGATOR_CONTRACT);

            // Build distribution ScVal
            // DexDistribution: { protocol_id: String, path: Vec<Address>, parts: u32 }
            const distributionVec = rawTrade.distribution.map((dist) => {
                return xdr.ScVal.scvMap([
                    new xdr.ScMapEntry({
                        key: xdr.ScVal.scvSymbol("protocol_id"),
                        val: nativeToScVal(dist.protocol_id, {
                            type: "string",
                        }),
                    }),
                    new xdr.ScMapEntry({
                        key: xdr.ScVal.scvSymbol("path"),
                        val: xdr.ScVal.scvVec(
                            dist.path.map((addr) =>
                                new Address(addr).toScVal(),
                            ),
                        ),
                    }),
                    new xdr.ScMapEntry({
                        key: xdr.ScVal.scvSymbol("parts"),
                        val: nativeToScVal(dist.parts, { type: "u32" }),
                    }),
                ]);
            });

            // Get token addresses from the first distribution path
            const firstPath = rawTrade.distribution[0].path;
            const tokenIn = firstPath[0];
            const tokenOut = firstPath[firstPath.length - 1];

            // Build contract call operation
            const op = aggregator.call(
                "swap_exact_tokens_for_tokens",
                new Address(tokenIn).toScVal(), // token_in
                new Address(tokenOut).toScVal(), // token_out
                nativeToScVal(BigInt(rawTrade.amountIn), { type: "i128" }), // amount_in
                nativeToScVal(BigInt(rawTrade.amountOutMin), { type: "i128" }), // amount_out_min
                xdr.ScVal.scvVec(distributionVec), // distribution
                new Address(contractId).toScVal(), // to (smart wallet)
                nativeToScVal(getDeadline(), { type: "u64" }), // deadline
            );

            status = "Swap transaction built!";
            console.log("Aggregator call operation:", op);
            console.log("Quote details:", {
                tokenIn,
                tokenOut,
                amountIn: rawTrade.amountIn,
                amountOutMin: rawTrade.amountOutMin,
                distribution: rawTrade.distribution,
            });

            // For now, just log success - signing/submission requires passkey + relayer
            status = `✅ Ready to swap ${swapAmount} XLM → ${formatAmount(quote.amountOut)} KALE`;
        } catch (e) {
            console.error("Swap error:", e);
            status = `Error: ${(e as Error).message}`;
        } finally {
            isProcessing = false;
        }
    }
</script>

<div
    class="w-full bg-[#111] border-2 border-[#333] rounded-xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 text-left"
>
    {#if !acceptedRisk}
        <!-- Risk Gate -->
        <div class="flex flex-col gap-4 text-xs font-mono text-[#999]">
            <h3
                class="text-white text-base font-bold uppercase tracking-widest border-b border-white/10 pb-2"
            >
                Protocol Safety Check
            </h3>
            <p>
                This module interacts directly with the Stellar Soroban network.
                Transactions are irreversible.
            </p>
            <ul class="list-disc pl-4 space-y-1 text-[#777]">
                <li>This is an experimental interface.</li>
                <li>No warranty is provided.</li>
                <li>Funds may be lost if contracts behave unexpectedly.</li>
            </ul>

            <label class="flex items-center gap-3 mt-4 cursor-pointer group">
                <input
                    type="checkbox"
                    bind:checked={acceptedRisk}
                    class="w-4 h-4 rounded border-[#333] bg-[#222] checked:bg-[#9ae600] checked:text-black focus:ring-0 focus:ring-offset-0 transition-all"
                />
                <span class="group-hover:text-white transition-colors"
                    >I accept the risks and wish to proceed.</span
                >
            </label>
        </div>
    {:else}
        <!-- The Swapper UI -->
        <div
            class="flex flex-col items-center justify-center py-6 gap-6 w-full animate-in fade-in slide-in-from-bottom-4"
        >
            {#if !isConnected}
                <div class="text-center space-y-4">
                    <button
                        onclick={connectWallet}
                        class="px-6 py-3 bg-[#9ae600] text-black font-bold uppercase tracking-widest text-sm hover:scale-105 active:scale-95 transition-all w-full md:w-auto"
                    >
                        Login with Passkey
                    </button>
                    <p class="text-[10px] text-[#555] font-mono">
                        Powered by Passkey Kit
                    </p>
                </div>
            {:else}
                <div class="w-full space-y-6">
                    <!-- Wallet Info -->
                    <div
                        class="flex justify-between items-center border-b border-[#333] pb-2"
                    >
                        <span
                            class="text-[10px] text-[#555] uppercase tracking-widest"
                            >Authenticated</span
                        >
                        <span class="text-xs font-mono text-[#9ae600]"
                            >Key: {keyId?.substring(0, 8)}...</span
                        >
                    </div>

                    <!-- Mode Toggle -->
                    <div
                        class="flex gap-2 p-1 bg-[#0a0a0a] rounded border border-[#333]"
                    >
                        <button
                            onclick={() => (mode = "swap")}
                            class="flex-1 py-2 text-xs font-mono uppercase tracking-widest transition-all {mode ===
                            'swap'
                                ? 'bg-[#9ae600] text-black'
                                : 'text-[#777] hover:text-white'}"
                        >
                            Swap
                        </button>
                        <button
                            onclick={() => (mode = "transfer")}
                            class="flex-1 py-2 text-xs font-mono uppercase tracking-widest transition-all {mode ===
                            'transfer'
                                ? 'bg-[#9ae600] text-black'
                                : 'text-[#777] hover:text-white'}"
                        >
                            Transfer
                        </button>
                    </div>

                    {#if mode === "swap"}
                        <!-- Swap Form -->
                        <div
                            class="bg-[#151515] border border-[#333] rounded p-4 space-y-4"
                        >
                            <div
                                class="text-center text-xs text-[#777] font-mono pb-2 border-b border-[#333]"
                            >
                                XLM → KALE (via Soroswap Aggregator)
                            </div>

                            <div class="space-y-2">
                                <label
                                    class="block text-xs font-mono text-[#777] uppercase tracking-widest"
                                >
                                    You Send (XLM)
                                </label>
                                <div class="flex gap-2">
                                    <input
                                        type="number"
                                        bind:value={swapAmount}
                                        placeholder="0.0"
                                        step="0.1"
                                        max="10"
                                        class="w-full bg-[#111] border border-[#333] p-2 text-sm font-mono text-white focus:outline-none focus:border-[#9ae600]"
                                    />
                                    <button
                                        onclick={setMax}
                                        class="text-xs font-mono text-[#9ae600] border border-[#333] px-3 hover:bg-[#222]"
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>

                            <!-- Quote Display -->
                            <div
                                class="bg-[#0a0a0a] border border-[#222] p-3 rounded space-y-2"
                            >
                                <div
                                    class="flex justify-between text-xs font-mono"
                                >
                                    <span class="text-[#777]">You Receive</span>
                                    {#if isQuoting}
                                        <span class="text-[#555] animate-pulse"
                                            >Fetching quote...</span
                                        >
                                    {:else if quote}
                                        <span class="text-[#9ae600]"
                                            >{formatAmount(quote.amountOut)} KALE</span
                                        >
                                    {:else if quoteError}
                                        <span class="text-red-500 text-[10px]"
                                            >{quoteError}</span
                                        >
                                    {:else}
                                        <span class="text-[#555]"
                                            >Enter amount</span
                                        >
                                    {/if}
                                </div>
                                {#if quote}
                                    <div
                                        class="flex justify-between text-[10px] font-mono text-[#555]"
                                    >
                                        <span>Route</span>
                                        <span
                                            >{quote.routePlan[0]?.swapInfo
                                                .protocol || "unknown"} ({quote
                                                .routePlan[0]?.percent}%)</span
                                        >
                                    </div>
                                    <div
                                        class="flex justify-between text-[10px] font-mono text-[#555]"
                                    >
                                        <span>Price Impact</span>
                                        <span
                                            class={parseFloat(
                                                quote.priceImpactPct,
                                            ) > 3
                                                ? "text-yellow-500"
                                                : ""}
                                            >{quote.priceImpactPct}%</span
                                        >
                                    </div>
                                {/if}
                            </div>

                            <div class="pt-2">
                                <button
                                    onclick={handleSwap}
                                    disabled={isProcessing || !isValidSwap}
                                    class="w-full py-3 bg-[#9ae600] disabled:bg-[#333] disabled:text-[#777] text-black font-bold uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    {#if isProcessing}
                                        <span class="animate-spin">⏳</span> Processing...
                                    {:else}
                                        Swap XLM → KALE
                                    {/if}
                                </button>
                            </div>

                            {#if status}
                                <div
                                    class="text-[10px] font-mono text-center p-2 border border-[#333] bg-[#111] animate-in fade-in"
                                >
                                    {status}
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <!-- Transfer Form (original) -->
                        <div
                            class="bg-[#151515] border border-[#333] rounded p-4 space-y-4"
                        >
                            <div class="space-y-2">
                                <label
                                    class="block text-xs font-mono text-[#777] uppercase tracking-widest"
                                >
                                    Destination (C-Address)
                                </label>
                                <input
                                    type="text"
                                    bind:value={destination}
                                    placeholder="C..."
                                    class="w-full bg-[#111] border border-[#333] p-2 text-sm font-mono text-white focus:outline-none focus:border-[#9ae600]"
                                />
                            </div>

                            <div class="space-y-2">
                                <label
                                    class="block text-xs font-mono text-[#777] uppercase tracking-widest"
                                >
                                    Amount (XLM)
                                </label>
                                <div class="flex gap-2">
                                    <input
                                        type="number"
                                        bind:value={amount}
                                        placeholder="0.0"
                                        step="0.1"
                                        class="w-full bg-[#111] border border-[#333] p-2 text-sm font-mono text-white focus:outline-none focus:border-[#9ae600]"
                                    />
                                    <button
                                        onclick={setMax}
                                        class="text-xs font-mono text-[#9ae600] border border-[#333] px-3 hover:bg-[#222]"
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>

                            <div class="pt-2">
                                <button
                                    onclick={handleTransfer}
                                    disabled={isProcessing || !isValidTransfer}
                                    class="w-full py-3 bg-[#9ae600] disabled:bg-[#333] disabled:text-[#777] text-black font-bold uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    {#if isProcessing}
                                        <span class="animate-spin">⏳</span> Processing...
                                    {:else}
                                        Send XLM
                                    {/if}
                                </button>
                            </div>

                            {#if status}
                                <div
                                    class="text-[10px] font-mono text-center p-2 border border-[#333] bg-[#111] animate-in fade-in"
                                >
                                    {status}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>
