<script lang="ts">
    import { account, sac, kale, xlm, send } from "../../utils/passkey-kit";
    import { onMount, tick } from "svelte";
    import { getSafeRpId } from "../../utils/domains";
    import { Buffer } from "buffer";
    import {
        getQuote,
        buildTransaction,
        sendTransaction,
        TOKENS,
        formatAmount,
        toStroops,
        type QuoteResponse,
    } from "../../utils/soroswap";
    import {
        buildSwapTransactionForCAddress,
        isCAddress,
    } from "../../utils/swap-builder";
    import {
        userState,
        setUserAuth,
        ensureWalletConnected,
    } from "../../stores/user.svelte";
    import {
        balanceState,
        updateAllBalances,
    } from "../../stores/balance.svelte";
    import KaleEmoji from "../ui/KaleEmoji.svelte";
    import { Turnstile } from "svelte-turnstile";
    import { getLatestSequence, pollTransaction } from "../../utils/base";
    import { Transaction, Networks } from "@stellar/stellar-sdk/minimal";

    import {
        getXBullQuote,
        buildXBullTransaction,
    } from "../../utils/xbull-api";

    // --- TYPES ---
    type AppState = "intro" | "transition" | "main";
    type Mode = "swap" | "send";
    type Provider = "soroswap" | "xbull";
    type SwapState =
        | "idle"
        | "quoting"
        | "simulated_ok"
        | "simulated_error"
        | "awaiting_passkey"
        | "submitting"
        | "confirmed"
        | "failed";
    type SwapDirection = "XLM_TO_KALE" | "KALE_TO_XLM";

    // --- STATE ---
    let appState = $state<AppState>("intro");
    let mode = $state<Mode>("swap");

    // Auth & Demo
    let isDemoMode = $state(false);
    let isAuthenticated = $derived(!!userState.contractId || isDemoMode);

    // Swap Logic
    let swapState = $state<SwapState>("idle");
    let direction = $state<SwapDirection>("XLM_TO_KALE");

    // Bi-Directional Input State
    let swapAmount = $state(""); // Top Input (Sell)
    let swapOutputAmount = $state(""); // Bottom Input (Buy)
    let lastEdited = $state<"in" | "out">("in"); // Track which box user typed in

    let quote = $state<QuoteResponse | null>(null);
    let quoteError = $state("");
    let statusMessage = $state("");
    let txHash = $state<string | null>(null);
    let turnstileToken = $state("");
    let turnstileFailed = $state(false); // Fallback mode when Turnstile returns 401

    // Provider Logic
    let provider = $state<Provider>("soroswap");

    // Send Logic
    let sendTo = $state("");
    let sendAmount = $state("");
    let sendToken = $state<"XLM" | "KALE">("XLM");

    // Balances
    let xlmBalance = $derived(balanceState.xlmBalance);
    let kaleBalance = $derived(balanceState.balance);

    // Derived Display
    let tokenInSymbol = $derived(
        mode === "swap"
            ? direction === "XLM_TO_KALE"
                ? "XLM"
                : "KALE"
            : sendToken,
    );
    let tokenOutSymbol = $derived(direction === "XLM_TO_KALE" ? "KALE" : "XLM");
    let balanceIn = $derived(
        mode === "swap"
            ? direction === "XLM_TO_KALE"
                ? xlmBalance
                : kaleBalance
            : sendToken === "XLM"
              ? xlmBalance
              : kaleBalance,
    );

    // --- UTILS ---
    function formatBigInt(val: bigint | null, decimals = 7): string {
        if (val === null) return "...";
        const str = Number(val) / 10_000_000;
        return str.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    // Rate Calculation Helper
    function calculateRate(
        quote: QuoteResponse,
        amountIn: string,
        amountOut: string,
    ): string {
        try {
            const inVal = parseFloat(amountIn);
            const outVal = parseFloat(amountOut);

            if (!inVal || !outVal) return "--";

            // Rate: How much OUT for 1 IN?
            const rate = outVal / inVal;

            // Format nicely
            return rate.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
            });
        } catch (e) {
            return "--";
        }
    }

    function toggleDirection() {
        direction = direction === "XLM_TO_KALE" ? "KALE_TO_XLM" : "XLM_TO_KALE";
        swapAmount = "";
        swapOutputAmount = "";
        lastEdited = "in";
        quote = null;
        quoteError = "";
        swapState = "idle";
    }

    function getImpactColor(pct: string | undefined): string {
        if (!pct) return "#4ade80"; // Default nice green
        const val = parseFloat(pct);
        if (isNaN(val)) return "#4ade80";
        if (val <= 5) return "#4ade80"; // Green
        if (val <= 10) return "#facc15"; // Yellow
        return "#ef4444"; // Red
    }

    // --- LIFECYCLE ---
    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("demo") === "true") {
            isDemoMode = true;
            if (!userState.contractId) {
                setUserAuth(
                    "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM",
                    "DEMO-KEY-12345678",
                );
            }
        }
        if (
            userState.contractId &&
            localStorage.getItem("smol:skip_intro") === "true"
        ) {
            appState = "main";
            refreshBalances();
        }
    });

    async function handleEnter() {
        try {
            if (!isAuthenticated) {
                // console.log("Connecting with rpId:", rpId); // Debug logging if needed

                const result = await account.get().connectWallet({
                    rpId: getSafeRpId(window.location.hostname),
                });
                // Use keyIdBase64 if available (PasskeyKit v0.6+), otherwise convert with URL-safe replacement
                const keyIdSafe =
                    result.keyIdBase64 ||
                    (typeof result.keyId === "string"
                        ? result.keyId
                        : Buffer.from(result.keyId)
                              .toString("base64")
                              .replace(/\+/g, "-")
                              .replace(/\//g, "_")
                              .replace(/=+$/, ""));

                setUserAuth(result.contractId, keyIdSafe);
            } else {
                // Already authenticated (localStorage), but ensure wallet instance is connected
                await ensureWalletConnected();
            }
            appState = "transition";
            setTimeout(() => {
                appState = "main";
                refreshBalances();
                localStorage.setItem("smol:skip_intro", "true");
            }, 1000);
        } catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : String(e); // Keep concise
            alert(`Entry failed: ${msg}`);
        }
    }

    async function refreshBalances() {
        if (userState.contractId) {
            await updateAllBalances(userState.contractId);
        }
    }

    // --- SWAP QUOTING ---
    let quoteTimeout: ReturnType<typeof setTimeout>;

    function handleInputChange(type: "in" | "out") {
        lastEdited = type;
        if (type === "in" && !swapAmount) {
            swapOutputAmount = "";
            quote = null;
            return;
        }
        if (type === "out" && !swapOutputAmount) {
            swapAmount = "";
            quote = null;
            return;
        }
        fetchQuote();
    }

    async function fetchQuote() {
        clearTimeout(quoteTimeout);
        quoteTimeout = setTimeout(async () => {
            const amountStr =
                lastEdited === "in" ? swapAmount : swapOutputAmount;
            if (!amountStr || parseFloat(amountStr) <= 0) {
                quote = null;
                swapState = "idle";
                return;
            }

            swapState = "quoting";
            turnstileFailed = false; // Reset to allow Turnstile retry on new quote

            try {
                const stroops = toStroops(amountStr);
                const assetIn =
                    direction === "XLM_TO_KALE" ? TOKENS.XLM : TOKENS.KALE;
                const assetOut =
                    direction === "XLM_TO_KALE" ? TOKENS.KALE : TOKENS.XLM;
                const tradeType =
                    lastEdited === "in" ? "EXACT_IN" : "EXACT_OUT";

                let result;
                if (provider === "soroswap") {
                    result = await getQuote({
                        assetIn,
                        assetOut,
                        amount: Number(stroops),
                        tradeType,
                        slippageBps: 500, // 5% (matches Tyler's ohloss implementation)
                    });
                } else {
                    // xBull API
                    const sender = userState.contractId || undefined;
                    const xbullResult = await getXBullQuote({
                        fromAsset: assetIn,
                        toAsset: assetOut,
                        fromAmount: String(stroops),
                        sender: sender,
                    });

                    // Map xBull response to local QuoteResponse format
                    result = {
                        amountIn: xbullResult.fromAmount,
                        amountOut: xbullResult.toAmount,
                        minAmountOut: xbullResult.toAmount, // xBull pre-calculates slippage in toAmount maybe? or user sets minToGet in accept
                        price: (
                            Number(xbullResult.toAmount) /
                            Number(xbullResult.fromAmount)
                        ).toFixed(7),
                        path: [], // xBull handles routing internally via UUID
                        tradeType,
                        // Custom props for xBull
                        xbullRoute: xbullResult.route,
                        otherAmountThreshold: xbullResult.toAmount, // Placeholder
                    } as any;
                }

                quote = result;

                if (lastEdited === "in") {
                    swapOutputAmount = formatAmount(quote!.amountOut);
                } else {
                    swapAmount = formatAmount(quote!.amountIn);
                }

                swapState = "simulated_ok";
            } catch (e) {
                console.error("Quote error:", e);
                swapState = "simulated_error";
                statusMessage = "Route Unavailable";
            }
        }, 500);
    }

    // --- ACTIONS ---
    async function handleAction() {
        if (!userState.contractId || !userState.keyId) {
            statusMessage = "Connect wallet first";
            return;
        }

        if (mode === "swap") {
            await executeSwap();
        } else {
            await executeSend();
        }
    }

    async function executeSwap() {
        if (!quote || !userState.contractId || !userState.keyId) {
            statusMessage = "No quote available";
            return;
        }

        // Require either Turnstile token OR fallback mode
        const useFallback = turnstileFailed && !turnstileToken;
        if (!turnstileToken && !useFallback) {
            statusMessage = "Complete verification first";
            return;
        }

        swapState = "awaiting_passkey";
        statusMessage = "Building swap...";

        try {
            // 1. Build Transaction
            let signedTx;
            let transactionXDR;

            console.log(
                "[SwapperCore] Executing swap for:",
                userState.contractId,
                "via:",
                provider,
            );

            if (provider === "soroswap") {
                if (isCAddress(userState.contractId)) {
                    // C address: Build via direct aggregator contract invocation
                    statusMessage = "Building C-address swap...";
                    const t = await buildSwapTransactionForCAddress(
                        quote,
                        userState.contractId,
                    );

                    // Convert AssembledTransaction to XDR string for signing
                    // Note: passkey-kit sign() can take AssembledTransaction directly,
                    // but for consistency with xBull path (which returns XDR string), we use XDR path if possible,
                    // OR we just pass 't' if it's an AssembledTx.
                    // Let's pass 't' directly for C-Address path as before.

                    // Sign with passkey
                    const kit = account.get();
                    if (!kit.wallet) {
                        console.log(
                            "[SwapperCore] Wallet not connected, attempting reconnect...",
                        );
                        await kit.connectWallet({
                            rpId: getSafeRpId(window.location.hostname),
                            keyId: userState.keyId,
                            getContractId: async () =>
                                userState.contractId ?? undefined,
                        });
                    }
                    const sequence = await getLatestSequence();
                    signedTx = await kit.sign(t, {
                        rpId: getSafeRpId(window.location.hostname),
                        keyId: userState.keyId,
                        expiration: sequence + 60,
                    });
                } else {
                    // G address: Use Soroswap API (may work for traditional accounts)
                    const result = await buildTransaction(
                        quote,
                        userState.contractId,
                        userState.contractId,
                    );
                    transactionXDR = result.xdr;

                    // Sign with passkey
                    const kit = account.get();
                    if (!kit.wallet) {
                        console.log(
                            "[SwapperCore] Wallet not connected, attempting reconnect...",
                        );
                        await kit.connectWallet({
                            rpId: getSafeRpId(window.location.hostname),
                            keyId: userState.keyId,
                            getContractId: async () =>
                                userState.contractId ?? undefined,
                        });
                    }
                    const sequence = await getLatestSequence();

                    // Wrap XDR in Transaction object for kit.sign (minimal SDK)
                    const tx = new Transaction(
                        transactionXDR,
                        import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
                    );

                    signedTx = await kit.sign(tx, {
                        rpId: getSafeRpId(window.location.hostname),
                        keyId: userState.keyId,
                        expiration: sequence + 60,
                    });
                }
            } else {
                // xBull Logic
                statusMessage = "Building xBull swap...";
                // Note: quote cast as 'any' to access xbullRoute.
                const xbullQuote = quote as any;
                if (!xbullQuote.xbullRoute) {
                    throw new Error("Invalid xBull quote");
                }

                // Call xBull Accept Quote API to get XDR
                const result = await buildXBullTransaction({
                    fromAmount: xbullQuote.amountIn,
                    minToGet: xbullQuote.amountOut, // Using amountOut as minToGet for now
                    route: xbullQuote.xbullRoute,
                    sender: userState.contractId,
                    recipient: userState.contractId,
                    gasless: false,
                });
                transactionXDR = result.xdr;

                // Sign with passkey
                const kit = account.get();
                if (!kit.wallet) {
                    console.log(
                        "[SwapperCore] Wallet not connected, attempting reconnect...",
                    );
                    await kit.connectWallet({
                        rpId: getSafeRpId(window.location.hostname),
                        keyId: userState.keyId,
                        getContractId: async () =>
                            userState.contractId ?? undefined,
                    });
                }
                const sequence = await getLatestSequence();

                // Wrap XDR in Transaction object for kit.sign (minimal SDK)
                const tx = new Transaction(
                    transactionXDR,
                    import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
                );

                signedTx = await kit.sign(tx, {
                    rpId: getSafeRpId(window.location.hostname),
                    keyId: userState.keyId,
                    expiration: sequence + 60,
                });
            }

            // 3. Submit transaction with timeout recovery
            swapState = "submitting";

            // Calculate txHash BEFORE submission for recovery polling
            const builtTx = signedTx.built;
            const calculatedHash = builtTx?.hash().toString("hex");
            console.log(
                "[SwapperCore] Calculated txHash before submit:",
                calculatedHash,
            );

            let result;
            if (useFallback) {
                // Fallback: Direct to Soroswap (user pays XLM fee)
                statusMessage = "Submitting via Soroswap...";
                result = await sendTransaction(signedTx.toXDR(), false);
            } else {
                // Primary: Tyler's relayer (sponsored fees) with timeout recovery
                statusMessage = "Submitting swap...";
                try {
                    result = await send(signedTx, turnstileToken);

                    // Even on success, verify ledger state
                    if (calculatedHash) {
                        console.log(
                            "[SwapperCore] Verifying tx on network:",
                            calculatedHash,
                        );
                        await pollTransaction(calculatedHash);
                    }
                } catch (submitErr) {
                    console.warn(
                        "[SwapperCore] Relayer timeout/error, attempting recovery...",
                        submitErr,
                    );

                    // Timeout Recovery: If relayer timed out (30s), it might still be processing.
                    // Poll the network directly to see if it landed.
                    if (calculatedHash) {
                        statusMessage = "Verifying transaction...";
                        console.log(
                            "[SwapperCore] Recovery polling for:",
                            calculatedHash,
                        );
                        await pollTransaction(calculatedHash);
                        console.log(
                            "[SwapperCore] Recovery successful:",
                            calculatedHash,
                        );
                        result = { hash: calculatedHash };
                    } else {
                        throw submitErr; // Can't recover without hash
                    }
                }
            }

            txHash = result?.hash || calculatedHash || "submitted";
            swapState = "confirmed";
            statusMessage = useFallback
                ? "Swap complete! (paid fee)"
                : "Swap complete!";

            // Reset for next swap
            swapAmount = "";
            swapOutputAmount = "";
            quote = null;
            turnstileToken = "";

            refreshBalances();
        } catch (e) {
            console.error("Swap error:", e);
            const message = e instanceof Error ? e.message : "Swap failed";

            // Check for user cancellation
            if (
                message.toLowerCase().includes("abort") ||
                message.toLowerCase().includes("cancel") ||
                message.toLowerCase().includes("not allowed")
            ) {
                statusMessage = "Swap cancelled";
            } else {
                statusMessage = message;
            }
            swapState = "failed";

            // Clear used/stale token
            turnstileToken = "";
        }
    }

    async function executeSend() {
        if (!userState.contractId || !userState.keyId) {
            statusMessage = "Connect wallet first";
            return;
        }

        const recipient = sendTo.trim();
        if (!recipient) {
            statusMessage = "Enter a recipient address";
            return;
        }

        if (recipient === userState.contractId) {
            statusMessage = "Cannot send to yourself";
            return;
        }

        const amountNum = parseFloat(sendAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            statusMessage = "Enter a valid amount";
            return;
        }

        // Convert to stroops (7 decimals)
        const amountInStroops = BigInt(Math.floor(amountNum * 10_000_000));

        // Check balance
        const currentBalance = sendToken === "KALE" ? kaleBalance : xlmBalance;
        if (
            typeof currentBalance === "bigint" &&
            amountInStroops > currentBalance
        ) {
            statusMessage = "Insufficient balance";
            return;
        }

        // Require Turnstile or fallback
        const useFallback = turnstileFailed && !turnstileToken;
        if (!turnstileToken && !useFallback) {
            statusMessage = "Complete verification first";
            return;
        }

        swapState = "awaiting_passkey";
        statusMessage = `Sending ${sendToken}...`;

        try {
            // Build transfer transaction
            let tx;
            if (sendToken === "KALE") {
                tx = await kale.get().transfer({
                    from: userState.contractId,
                    to: recipient,
                    amount: amountInStroops,
                });
            } else {
                // XLM transfer via SAC
                tx = await xlm.get().transfer({
                    from: userState.contractId,
                    to: recipient,
                    amount: amountInStroops,
                });
            }

            // Sign with passkey
            const kit = account.get();
            if (!kit.wallet) {
                console.log(
                    "[SwapperCore] Send: Wallet not connected, attempting reconnect...",
                );
                await kit.connectWallet({
                    rpId: getSafeRpId(window.location.hostname),
                    keyId: userState.keyId,
                    getContractId: async () =>
                        userState.contractId ?? undefined,
                });
            }

            const sequence = await getLatestSequence();
            const signedTx = await kit.sign(tx, {
                rpId: getSafeRpId(window.location.hostname),
                keyId: userState.keyId,
                expiration: sequence + 60,
            });

            // Submit with timeout recovery
            swapState = "submitting";
            statusMessage = "Submitting transfer...";

            const calculatedHash = signedTx.built?.hash().toString("hex");
            console.log("[SwapperCore] Send txHash:", calculatedHash);

            try {
                await send(signedTx, turnstileToken);

                if (calculatedHash) {
                    console.log(
                        "[SwapperCore] Send: Verifying tx:",
                        calculatedHash,
                    );
                    await pollTransaction(calculatedHash);
                }
            } catch (submitErr) {
                console.warn(
                    "[SwapperCore] Send: Relayer error, attempting recovery...",
                    submitErr,
                );
                if (calculatedHash) {
                    statusMessage = "Verifying transfer...";
                    await pollTransaction(calculatedHash);
                    console.log(
                        "[SwapperCore] Send: Recovery successful:",
                        calculatedHash,
                    );
                } else {
                    throw submitErr;
                }
            }

            txHash = calculatedHash || "submitted";
            swapState = "confirmed";
            statusMessage = `Sent ${amountNum} ${sendToken}!`;

            // Reset
            sendTo = "";
            sendAmount = "";
            turnstileToken = "";

            refreshBalances();
        } catch (e) {
            console.error("Send error:", e);
            const message = e instanceof Error ? e.message : "Send failed";

            if (
                message.toLowerCase().includes("abort") ||
                message.toLowerCase().includes("cancel") ||
                message.toLowerCase().includes("not allowed")
            ) {
                statusMessage = "Send cancelled";
            } else {
                statusMessage = message;
            }
            swapState = "failed";

            // Clear used/stale token
            turnstileToken = "";
        }
    }
</script>

<!-- MOONLIGHT UI -->
<div class="w-full relative flex flex-col items-center justify-center p-2">
    {#if appState === "main"}
        <div class="w-full animate-in slide-in-from-bottom-4 duration-700">
            <!-- HEADER (Balances) -->
            <div class="flex justify-between items-center mb-4 px-2">
                <div class="flex gap-4 text-[10px]">
                    <div
                        class="bg-[#0f172a]/60 px-3 py-2 rounded-lg border border-[#1e293b] flex items-center gap-2 shadow-sm backdrop-blur-sm"
                    >
                        <img
                            src="https://cryptologos.cc/logos/stellar-xlm-logo.png"
                            alt="XLM"
                            class="w-3 h-3 object-contain invert opacity-70"
                        />
                        <span class="text-[#fdda24] uppercase tracking-wider"
                            >XLM</span
                        >
                        <span class="text-[#e2e8f0] drop-shadow-sm"
                            >{formatBigInt(xlmBalance, 2)}</span
                        >
                    </div>
                    <div
                        class="bg-[#0f172a]/60 px-3 py-2 rounded-lg border border-[#1e293b] flex items-center gap-2 shadow-sm backdrop-blur-sm"
                    >
                        <KaleEmoji size="w-3 h-3" />
                        <span class="text-[#94db03] uppercase tracking-wider"
                            >KALE</span
                        >
                        <span class="text-[#e2e8f0] drop-shadow-sm"
                            >{formatBigInt(kaleBalance, 2)}</span
                        >
                    </div>
                </div>
                <button
                    onclick={refreshBalances}
                    class="bg-[#0f172a]/60 w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e293b] text-[#64748b] hover:text-[#7dd3fc] hover:border-[#7dd3fc]/50 hover:bg-[#1e293b] transition-all text-xs backdrop-blur-sm"
                    >↻</button
                >
            </div>

            <!-- GLASS CARD (Moonlight) -->
            <div class="glass-panel flex flex-col relative overflow-hidden">
                <!-- TABS (Top Bar) -->
                <div class="flex border-b border-[#1e293b] bg-[#0f172a]/20">
                    <button
                        class="tab-btn"
                        class:active={mode === "swap"}
                        onclick={() => (mode = "swap")}>SWAP</button
                    >
                    <button
                        class="tab-btn"
                        class:active={mode === "send"}
                        onclick={() => (mode = "send")}>SEND</button
                    >
                </div>

                <div class="p-6 md:p-8 flex flex-col gap-6">
                    {#if mode === "swap"}
                        <!-- PROVIDER TOGGLE -->
                        <div class="flex justify-center gap-2 mb-2">
                            <button
                                class="px-3 py-1 text-[10px] font-mono tracking-wider rounded-full border transition-all {provider ===
                                'soroswap'
                                    ? 'bg-white text-black border-white'
                                    : 'bg-transparent text-white/50 border-white/20 hover:text-white hover:border-white/50'}"
                                onclick={() => {
                                    provider = "soroswap";
                                    quote = null;
                                    if (swapAmount || swapOutputAmount)
                                        fetchQuote();
                                }}
                            >
                                SOROSWAP
                            </button>
                            <button
                                class="px-3 py-1 text-[10px] font-mono tracking-wider rounded-full border transition-all {provider ===
                                'xbull'
                                    ? 'bg-white text-black border-white'
                                    : 'bg-transparent text-white/50 border-white/20 hover:text-white hover:border-white/50'}"
                                onclick={() => {
                                    provider = "xbull";
                                    quote = null;
                                    if (swapAmount || swapOutputAmount)
                                        fetchQuote();
                                }}
                            >
                                XBULL
                            </button>
                        </div>

                        <!-- SWAP MODE -->
                        <div class="flex flex-col gap-2">
                            <!-- INPUT (TOP) -->
                            <div class="input-box group">
                                <input
                                    type="number"
                                    bind:value={swapAmount}
                                    oninput={() => handleInputChange("in")}
                                    placeholder="0.0"
                                    class="w-full bg-transparent text-[#f1f5f9] text-2xl focus:outline-none font-[inherit] placeholder-[#334155]"
                                />
                                <span
                                    class="text-xs text-[#94a3b8] ml-2 tracking-wider"
                                    >{tokenInSymbol}</span
                                >
                            </div>

                            <!-- FLIPPER BRIDGE (Compact) -->
                            <div class="flipper-bridge">
                                <button
                                    class="flipper-btn"
                                    onclick={toggleDirection}
                                    title="Flip Trade"
                                >
                                    ⇅
                                </button>
                            </div>

                            <!-- OUTPUT (BOTTOM - NOW EDITABLE) -->
                            <div class="input-box">
                                {#if swapState === "quoting" && lastEdited === "out"}
                                    <span
                                        class="text-sm text-[#7dd3fc] animate-pulse"
                                        >Calculating...</span
                                    >
                                {:else}
                                    <input
                                        type="number"
                                        bind:value={swapOutputAmount}
                                        oninput={() => handleInputChange("out")}
                                        placeholder="0.0"
                                        class="w-full bg-transparent text-[#f1f5f9] text-2xl focus:outline-none font-[inherit] placeholder-[#334155]"
                                    />
                                {/if}
                                <span
                                    class="text-xs text-[#94a3b8] ml-2 tracking-wider"
                                    >{tokenOutSymbol}</span
                                >
                            </div>
                        </div>
                    {:else}
                        <!-- SEND MODE -->
                        <div class="flex flex-col gap-4">
                            <!-- TOKEN SELECT -->
                            <div
                                class="flex bg-[#0f172a]/40 p-1.5 rounded-xl border border-[#1e293b]"
                            >
                                <button
                                    class="flex-1 py-3 text-[10px] rounded-lg transition-all {sendToken ===
                                    'XLM'
                                        ? 'bg-[#334155] text-white shadow-sm'
                                        : 'text-[#64748b]'}"
                                    onclick={() => (sendToken = "XLM")}
                                    >XLM</button
                                >
                                <button
                                    class="flex-1 py-3 text-[10px] rounded-lg transition-all {sendToken ===
                                    'KALE'
                                        ? 'bg-[#0284c7] text-white shadow-sm'
                                        : 'text-[#64748b]'}"
                                    onclick={() => (sendToken = "KALE")}
                                    >KALE</button
                                >
                            </div>

                            <div
                                class="bg-[#0f172a]/40 p-4 rounded-xl border border-[#1e293b]"
                            >
                                <label
                                    class="text-[9px] uppercase text-[#64748b] mb-2 block tracking-widest"
                                    >Address</label
                                >
                                <input
                                    type="text"
                                    bind:value={sendTo}
                                    placeholder="G..."
                                    class="w-full bg-transparent text-xs text-[#f1f5f9] focus:outline-none font-[inherit] placeholder-[#334155]"
                                />
                            </div>

                            <div
                                class="bg-[#0f172a]/40 p-4 rounded-xl border border-[#1e293b] flex items-center"
                            >
                                <input
                                    type="number"
                                    bind:value={sendAmount}
                                    placeholder="0.0"
                                    class="w-full bg-transparent text-[#f1f5f9] text-xl focus:outline-none font-[inherit] placeholder-[#334155]"
                                />
                                <span class="text-xs text-[#94a3b8]"
                                    >{sendToken}</span
                                >
                            </div>
                        </div>
                    {/if}

                    <!-- DATA TUCKED AWAY (Bottom of stack, subtle) -->
                    {#if mode === "swap"}
                        <div
                            class="flex justify-between px-2 opacity-60 text-[8px] tracking-widest text-[#64748b] hover:opacity-100 transition-opacity cursor-default"
                        >
                            <div class="flex gap-3">
                                <span
                                    >Via: <span class="text-[#94a3b8]"
                                        >{quote
                                            ? quote.routePlan?.length > 1
                                                ? "Multi-Hop"
                                                : quote.routePlan?.[0]?.swapInfo?.protocol?.toUpperCase() ||
                                                  (quote.routePlan?.length === 1
                                                      ? "Direct"
                                                      : "--")
                                            : "--"}</span
                                    ></span
                                >
                                <span
                                    >Impact: <span
                                        style="color: {getImpactColor(
                                            quote?.priceImpactPct,
                                        )}"
                                        >{quote?.priceImpactPct ??
                                            "0.00"}%</span
                                    ></span
                                >
                            </div>
                            {#if quote}
                                <span class="text-[#7dd3fc]"
                                    >Rate: 1 {tokenInSymbol} ≈ {calculateRate(
                                        quote,
                                        swapAmount,
                                        swapOutputAmount,
                                    )}
                                    {tokenOutSymbol}</span
                                >
                            {/if}
                        </div>
                    {/if}

                    <!-- Turnstile Verification (for swap mode) -->
                    {#if mode === "swap" && quote && !turnstileToken && !turnstileFailed}
                        <div
                            class="flex justify-center -mb-2 scale-90 origin-center"
                        >
                            <Turnstile
                                siteKey={import.meta.env
                                    .PUBLIC_TURNSTILE_SITE_KEY}
                                on:callback={(e) => {
                                    turnstileToken = e.detail.token;
                                    turnstileFailed = false;
                                }}
                                on:expired={() => {
                                    turnstileToken = "";
                                }}
                                on:error={() => {
                                    console.log(
                                        "Turnstile failed, enabling fallback",
                                    );
                                    turnstileFailed = true;
                                }}
                                on:timeout={() => {
                                    console.log(
                                        "Turnstile timeout, enabling fallback",
                                    );
                                    turnstileFailed = true;
                                }}
                                theme="dark"
                                appearance="interaction-only"
                            />
                        </div>
                    {/if}

                    <!-- Fallback Notice (when Turnstile fails) -->
                    {#if mode === "swap" && quote && turnstileFailed && !turnstileToken}
                        <div
                            class="text-center text-[9px] text-[#fbbf24] bg-[#fbbf24]/10 px-3 py-2 rounded-lg border border-[#fbbf24]/30"
                        >
                            ⚠️ Verification unavailable. You'll pay ~0.0001 XLM
                            fee.
                        </div>
                    {/if}

                    <!-- ACTION BUTTON -->
                    <button
                        onclick={handleAction}
                        class="action-btn w-full py-5 text-sm font-bold shadow-lg"
                        disabled={swapState === "submitting" ||
                            (mode === "swap" &&
                                quote &&
                                !turnstileToken &&
                                !turnstileFailed)}
                    >
                        {#if swapState === "submitting"}
                            {mode === "swap" ? "Swapping..." : "Sending..."}
                        {:else if mode === "swap" && turnstileFailed && !turnstileToken}
                            Swap (pay fee)
                        {:else}
                            {mode === "swap" ? "Swap" : "Send"}
                        {/if}
                    </button>
                </div>
            </div>

            <!-- FEEDBACK text -->
            {#if statusMessage}
                <div
                    class="text-center mt-6 text-[10px] text-[#7dd3fc] tracking-widest drop-shadow-[0_0_10px_rgba(125,211,252,0.5)]"
                >
                    {statusMessage}
                </div>
            {/if}
        </div>
    {:else}
        <!-- INTRO (Moonlight) -->
        <div class="text-center">
            <h1
                class="text-4xl text-[#e0f2fe] mb-8 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]"
                style="-webkit-text-stroke: 1px #0ea5e9;"
            >
                Kale Forest
            </h1>
            <button
                onclick={handleEnter}
                class="action-btn px-10 py-5 text-sm rounded-xl">Enter</button
            >
        </div>
    {/if}
</div>

<style>
    /* MOONLIGHT GLASS CARD */
    .glass-panel {
        /* Translucent Slate Blue */
        background: rgba(29, 41, 61, 0.4);
        border: 1px solid rgba(130, 200, 255, 0.15);
        backdrop-filter: blur(24px);
        box-shadow:
            0 20px 50px rgba(0, 0, 0, 0.6),
            inset 0 1px 0 rgba(255, 255, 255, 0.15),
            inset 0 0 20px rgba(29, 41, 61, 0.2);
        border-radius: 24px;
        transition: all 0.3s ease;
    }

    /* TABS */
    .tab-btn {
        background: transparent;
        border: none;
        color: #64748b;
        font-family: "Press Start 2P", cursive;
        font-size: 10px;
        padding: 16px;
        flex: 1;
        transition: all 0.2s;
        border-bottom: 2px solid transparent;
        letter-spacing: 0.2em;
        /* Removed uppercase */
    }
    .tab-btn.active {
        color: #bae6fd;
        border-bottom-color: #7dd3fc;
        background: linear-gradient(
            to bottom,
            transparent,
            rgba(186, 230, 253, 0.05)
        );
        text-shadow: 0 0 10px rgba(186, 230, 253, 0.5);
    }
    .tab-btn:hover:not(.active) {
        color: #94a3b8;
        background: rgba(255, 255, 255, 0.02);
    }

    /* INPUT GROUP */
    .input-box {
        background: rgba(10, 15, 25, 0.3);
        border: 1px solid rgba(130, 200, 255, 0.1);
        transition: all 0.2s;
        padding: 0 24px;
        height: 72px;
        display: flex;
        align-items: center;
        border-radius: 16px;
    }
    .input-box:focus-within {
        background: rgba(10, 15, 25, 0.5);
        border-color: #7dd3fc;
        box-shadow: 0 0 20px rgba(125, 211, 252, 0.1);
    }

    /* FLIPPER BRIDGE */
    .flipper-bridge {
        height: 12px;
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        z-index: 10;
        margin: -6px 0;
    }
    .flipper-btn {
        width: 32px;
        height: 32px;
        background: rgba(29, 41, 61, 0.8);
        border: 1px solid #3c4b64;
        border-radius: 8px;
        color: #94a3b8;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        cursor: pointer;
        backdrop-filter: blur(4px);
        transition: all 0.2s;
    }
    .flipper-btn:hover {
        background: #0f172a;
        border-color: #7dd3fc;
        color: #7dd3fc;
        box-shadow: 0 0 10px rgba(125, 211, 252, 0.2);
    }

    /* ACTION BUTTON */
    .action-btn {
        background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
        color: #94db03; /* Lime Green Requested */
        border: 1px solid #334155;
        border-bottom: 4px solid #020617;
        font-family: "Press Start 2P", cursive;
        letter-spacing: 0.2em;
        transition: all 0.1s;
        border-radius: 12px;
        text-shadow: 0 0 5px rgba(148, 219, 3, 0.5); /* Glowing Lime Text */
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4);
        /* Removed uppercase */
    }
    .action-btn:hover:not(:disabled) {
        background: linear-gradient(180deg, #334155 0%, #1e293b 100%);
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(0, 0, 0, 0.5);
        border-color: #94db03;
    }
    .action-btn:active:not(:disabled) {
        transform: translateY(2px);
        border-bottom-width: 2px;
    }
    .action-btn:disabled {
        background: #020617;
        border-color: #1e293b;
        color: #1e293b;
        cursor: not-allowed;
        box-shadow: none;
        text-shadow: none;
    }
</style>
