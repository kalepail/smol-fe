<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import Loader from "../ui/Loader.svelte";
    import KaleEmoji from "../ui/KaleEmoji.svelte";
    import { Turnstile } from "svelte-turnstile";
    import type { Smol } from "../../types/domain";
    import {
        calculateSupportPayment,
        sendSupportPayment,
        formatKaleAmount,
        type SupportPaymentBreakdown,
    } from "../../hooks/useMixtapeSupport";
    import { userState } from "../../stores/user.svelte.ts";
    import {
        balanceState,
        updateContractBalance,
    } from "../../stores/balance.svelte.ts";

    // PROD FIX: If we have an OZ API key, use direct relayer regardless of hostname.
    // This allows noot.smol.xyz to use OZ Channels directly without Turnstile.
    const hasApiKey = !!import.meta.env.PUBLIC_RELAYER_API_KEY;
    const isDirectRelayer = hasApiKey;

    interface Props {
        curatorAddress: string;
        curatorName?: string;
        tracks: Smol[];
        onDismiss: () => void;
    }

    let {
        curatorAddress,
        curatorName = "Curator",
        tracks,
        onDismiss,
    }: Props = $props();

    let submitting = $state(false);
    let progressMessage = $state("");
    let error = $state<string | null>(null);
    let success = $state(false);
    let turnstileToken = $state("");
    let needsVerification = $state(false);
    let resolveTokenPromise: ((token: string) => void) | null = null;

    async function requestNewToken(): Promise<string> {
        return new Promise((resolve) => {
            turnstileToken = "";
            needsVerification = true;
            resolveTokenPromise = resolve;
        });
    }

    // Calculate payment breakdown
    const breakdown = $derived(calculateSupportPayment(curatorAddress, tracks));
    const uniqueArtists = $derived(
        breakdown.recipients.filter((r) => r.type === "artist").length,
    );
    const uniqueMinters = $derived(
        breakdown.recipients.filter((r) => r.type === "minter").length,
    );

    async function handleSupport() {
        error = null;

        if (!userState.contractId) {
            window.dispatchEvent(new CustomEvent("smol:request-login"));
            return;
        }

        // Check balance
        if (
            typeof balanceState.balance === "bigint" &&
            breakdown.totalUnits > balanceState.balance
        ) {
            error = `insufficient kale balance. you need ${breakdown.totalKale} kale.`;
            return;
        }

        if (!isDirectRelayer && !turnstileToken) {
            error = "please complete the captcha";
            return;
        }

        submitting = true;
        const result = await sendSupportPayment(
            curatorAddress,
            tracks,
            turnstileToken,
            (step) => {
                progressMessage = step;
            },
            requestNewToken,
        );

        if (result.success) {
            success = true;
            // Refresh balance
            if (userState.contractId) {
                await updateContractBalance(userState.contractId);
            }
            // Auto-dismiss after showing success
            setTimeout(() => {
                onDismiss();
            }, 2000);
        } else {
            error = result.error || "payment failed";
            submitting = false;
        }
    }
</script>

<div
    class="relative overflow-hidden rounded-2xl border border-lime-500/20 bg-gradient-to-br from-lime-950/40 via-black/60 to-emerald-950/40 p-4 backdrop-blur-md shadow-[0_0_30px_rgba(132,204,22,0.1)]"
    transition:scale={{ start: 0.98, duration: 300 }}
>
    <!-- Decorative Kale Icon -->
    <div
        class="absolute -top-4 -right-4 w-20 h-20 opacity-10 pointer-events-none"
    >
        <img
            src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
            alt=""
            class="w-full h-full object-contain"
        />
    </div>

    {#if success}
        <!-- Success State -->
        <div class="text-center py-4 font-pixel" transition:fade>
            <div class="text-3xl mb-2">💚</div>
            <h3 class="text-xs font-bold text-lime-400 mb-1">thank you!</h3>
            <p class="text-white/60 text-[9px]">
                you supported {uniqueArtists} artist{uniqueArtists !== 1
                    ? "s"
                    : ""}, the curator{#if uniqueMinters > 0}, and {uniqueMinters}
                    minter{uniqueMinters !== 1 ? "s" : ""}{/if}!
            </p>
        </div>
    {:else}
        <!-- Header -->
        <div class="flex items-start justify-between gap-4 mb-3">
            <div>
                <h3
                    class="text-[10px] font-pixel font-bold text-lime-400 flex items-center gap-1.5"
                >
                    <img
                        src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                        alt="Kale"
                        class="w-3 h-3 object-contain"
                    />
                    support this mixtape
                </h3>
                <p class="text-white/50 text-[9px] mt-0.5 font-pixel">
                    {tracks.length} track{tracks.length !== 1 ? "s" : ""} curated
                    by {curatorName}
                </p>
            </div>

            <!-- Close button -->
            <button
                class="text-white/30 hover:text-white/60 transition-colors p-0.5"
                onclick={onDismiss}
                title="maybe later"
            >
                <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        <!-- Payment Breakdown -->
        <div
            class="bg-black/40 rounded-lg p-2 mb-3 border border-white/5 text-[9px] space-y-0.5 font-pixel"
        >
            <div class="flex justify-between text-white/60">
                <span
                    >price ({tracks.length} × 100 <KaleEmoji
                        size="w-2.5 h-2.5"
                    />)</span
                >
                <span class="text-white">{breakdown.totalKale} kale</span>
            </div>
            <div class="flex justify-between text-white/40">
                <span>→ curator ({breakdown.curatorPercent}%)</span>
                <span>{formatKaleAmount(breakdown.curatorShare)}</span>
            </div>
            {#if breakdown.artistShare > 0n}
                <div class="flex justify-between text-white/40">
                    <span
                        >→ {uniqueArtists} artist{uniqueArtists !== 1
                            ? "s"
                            : ""} ({breakdown.artistPercent}%)</span
                    >
                    <span>{formatKaleAmount(breakdown.artistShare)}</span>
                </div>
            {/if}
            {#if breakdown.minterShare > 0n}
                <div class="flex justify-between text-white/40">
                    <span
                        >→ {uniqueMinters} minter{uniqueMinters !== 1
                            ? "s"
                            : ""} ({breakdown.minterPercent}%)</span
                    >
                    <span>{formatKaleAmount(breakdown.minterShare)}</span>
                </div>
            {/if}
        </div>

        <!-- Prealpha Warning -->
        <div
            class="mb-3 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] text-center font-pixel"
        >
            ⚠️ prealpha feature • still testing
        </div>

        <!-- Error Message -->
        {#if error}
            <div
                class="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] text-center font-pixel"
                transition:fade
            >
                {error}
            </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-2 items-center">
            <!-- Visible Turnstile Wrapper to ensure it loads (only if not using direct relayer) -->
            {#if !isDirectRelayer && (!submitting || needsVerification)}
                {#if needsVerification}
                    <div
                        class="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center p-4 text-center rounded-2xl"
                        transition:fade
                    >
                        <p
                            class="text-lime-400 text-[10px] font-pixel mb-2 animate-pulse"
                        >
                            verify to continue next payment...
                        </p>
                        <div
                            class="scale-90 origin-center bg-black p-2 rounded-lg border border-lime-500/30"
                        >
                            <Turnstile
                                siteKey={import.meta.env
                                    .PUBLIC_TURNSTILE_SITE_KEY}
                                on:callback={(e) => {
                                    const token = e.detail.token;
                                    turnstileToken = token;
                                    if (resolveTokenPromise) {
                                        resolveTokenPromise(token);
                                        resolveTokenPromise = null;
                                        needsVerification = false;
                                    }
                                }}
                                on:expired={() => {
                                    turnstileToken = "";
                                }}
                                theme="dark"
                                appearance="interaction-only"
                            />
                        </div>
                    </div>
                {:else}
                    <div class="flex justify-center -mb-2 scale-75 origin-top">
                        <Turnstile
                            siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
                            on:callback={(e) => {
                                const token = e.detail.token;
                                turnstileToken = token;
                                if (resolveTokenPromise) {
                                    resolveTokenPromise(token);
                                    resolveTokenPromise = null;
                                    needsVerification = false;
                                }
                            }}
                            on:expired={() => {
                                turnstileToken = "";
                            }}
                            theme="dark"
                            appearance="interaction-only"
                        />
                    </div>
                {/if}
            {/if}

            <button
                class="flex-1 py-1.5 px-2 rounded-lg font-pixel font-bold text-[9px] transition-all flex items-center justify-center gap-1
                {submitting
                    ? 'bg-lime-700/50 text-lime-200 cursor-wait'
                    : 'bg-lime-500 text-black hover:bg-lime-400 shadow-[0_0_15px_rgba(132,204,22,0.3)]'}"
                onclick={handleSupport}
                disabled={submitting || (!isDirectRelayer && !turnstileToken)}
            >
                {#if submitting}
                    <Loader
                        classNames="w-2.5 h-2.5"
                        textColor="text-lime-200"
                    />
                    <span>{progressMessage || "processing..."}</span>
                {:else}
                    <span
                        >support ({breakdown.totalKale}
                        <KaleEmoji size="w-2.5 h-2.5" />)</span
                    >
                {/if}
            </button>

            <button
                class="py-1.5 px-2 rounded-lg font-pixel font-bold text-[9px] text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all"
                onclick={onDismiss}
                disabled={submitting}
            >
                listen free
            </button>
        </div>

        <!-- Altruistic Message -->
        <p class="text-center text-white/30 text-[8px] mt-2 font-pixel">
            100% goes directly to creators ✨
        </p>
    {/if}
</div>
