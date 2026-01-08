<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import Loader from "../ui/Loader.svelte";
    import type { Smol } from "../../types/domain";
    import {
        calculateSupportPayment,
        sendSupportPayment,
        formatKaleAmount,
        type SupportPaymentBreakdown,
    } from "../../hooks/useMixtapeSupport";
    import { userState } from "../../stores/user.svelte";
    import {
        balanceState,
        updateContractBalance,
    } from "../../stores/balance.svelte";

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
            error = `Insufficient KALE balance. You need ${breakdown.totalKale} KALE.`;
            return;
        }

        submitting = true;
        const result = await sendSupportPayment(
            curatorAddress,
            tracks,
            (step) => {
                progressMessage = step;
            },
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
            error = result.error || "Payment failed";
            submitting = false;
        }
    }
</script>

<div
    class="relative overflow-hidden rounded-2xl border border-lime-500/20 bg-gradient-to-br from-lime-950/40 via-black/60 to-emerald-950/40 p-5 md:p-6 backdrop-blur-md shadow-[0_0_30px_rgba(132,204,22,0.1)]"
    transition:scale={{ start: 0.98, duration: 300 }}
>
    <!-- Decorative Kale Icon -->
    <div
        class="absolute -top-4 -right-4 w-24 h-24 opacity-10 pointer-events-none"
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
            <div class="text-4xl mb-3">💚</div>
            <h3
                class="text-lg font-bold text-lime-400 mb-1 uppercase tracking-widest"
            >
                Thank You!
            </h3>
            <p class="text-white/60 text-sm uppercase tracking-wide">
                You supported {uniqueArtists} artist{uniqueArtists !== 1
                    ? "s"
                    : ""}, the curator{#if uniqueMinters > 0}, and {uniqueMinters}
                    minter{uniqueMinters !== 1 ? "s" : ""}{/if}!
            </p>
        </div>
    {:else}
        <!-- Header -->
        <div class="flex items-start justify-between gap-4 mb-4">
            <div>
                <h3
                    class="text-sm md:text-base font-pixel font-bold uppercase tracking-widest text-lime-400 flex items-center gap-2"
                >
                    <img
                        src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                        alt="Kale"
                        class="w-4 h-4 object-contain"
                    />
                    Support This Mixtape
                </h3>
                <p
                    class="text-white/50 text-xs mt-1 font-pixel uppercase tracking-wide"
                >
                    {tracks.length} track{tracks.length !== 1 ? "s" : ""} curated
                    by {curatorName}
                </p>
            </div>

            <!-- Close button -->
            <button
                class="text-white/30 hover:text-white/60 transition-colors p-1"
                onclick={onDismiss}
                title="Maybe later"
            >
                <svg
                    class="w-5 h-5"
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
            class="bg-black/40 rounded-xl p-3 mb-4 border border-white/5 text-xs space-y-1 font-pixel uppercase tracking-wide"
        >
            <div class="flex justify-between text-white/60">
                <span>Price ({tracks.length} tracks × 100 🥬)</span>
                <span class="text-white">{breakdown.totalKale} KALE</span>
            </div>
            <div class="flex justify-between text-white/40">
                <span>→ Curator (30%)</span>
                <span>{formatKaleAmount(breakdown.curatorShare)}</span>
            </div>
            {#if uniqueArtists > 0}
                <div class="flex justify-between text-white/40">
                    <span
                        >→ {uniqueArtists} Artist{uniqueArtists !== 1
                            ? "s"
                            : ""} (50%)</span
                    >
                    <span>{formatKaleAmount(breakdown.artistShare)}</span>
                </div>
            {/if}
            {#if uniqueMinters > 0}
                <div class="flex justify-between text-white/40">
                    <span
                        >→ {uniqueMinters} Minter{uniqueMinters !== 1
                            ? "s"
                            : ""} (20%)</span
                    >
                    <span>{formatKaleAmount(breakdown.minterShare)}</span>
                </div>
            {/if}
        </div>

        <!-- Prealpha Warning -->
        <div
            class="mb-4 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] text-center font-pixel uppercase tracking-wide"
        >
            ⚠️ Prealpha Feature • Still Testing
        </div>

        <!-- Error Message -->
        {#if error}
            <div
                class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center"
                transition:fade
            >
                {error}
            </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-3">
            <button
                class="flex-1 py-3 px-4 rounded-xl font-pixel font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2
        {submitting
                    ? 'bg-lime-700/50 text-lime-200 cursor-wait'
                    : 'bg-lime-500 text-black hover:bg-lime-400 shadow-[0_0_20px_rgba(132,204,22,0.3)] active:scale-98'}"
                onclick={handleSupport}
                disabled={submitting}
            >
                {#if submitting}
                    <Loader classNames="w-4 h-4" textColor="text-lime-200" />
                    <span>{progressMessage || "Processing..."}</span>
                {:else}
                    <span>Support ({breakdown.totalKale} 🥬)</span>
                {/if}
            </button>

            <button
                class="py-3 px-4 rounded-xl font-pixel font-bold text-xs uppercase tracking-widest text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all"
                onclick={onDismiss}
                disabled={submitting}
            >
                Listen Free
            </button>
        </div>

        <!-- Altruistic Message -->
        <p
            class="text-center text-white/30 text-[10px] mt-4 font-pixel uppercase tracking-wide"
        >
            100% of your support goes directly to creators ✨
        </p>
    {/if}
</div>
