<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Loader from "../ui/Loader.svelte";
    import { Turnstile } from "svelte-turnstile";

    // PROD FIX: If we have an OZ API key, use direct relayer regardless of hostname.
    // This allows noot.smol.xyz to use OZ Channels directly without Turnstile.
    const hasApiKey = !!import.meta.env.PUBLIC_RELAYER_API_KEY;
    const isDirectRelayer = hasApiKey;

    const dispatch = createEventDispatcher();

    interface Props {
        isOpen?: boolean;
        tracksToMint?: Array<{ id: string; title: string }>;
        tracksToPurchase?: Array<{ id: string; title: string }>;
        isProcessing?: boolean;
        currentStep?: string;
        completedSteps?: Set<string>;
    }

    let {
        isOpen = false,
        tracksToMint = [],
        tracksToPurchase = [],
        isProcessing = false,
        currentStep = "",
        completedSteps = new Set(),
    }: Props = $props();

    const totalMintCost = $derived(tracksToMint.length * 100); // 100 KALE per mint
    const totalPurchaseCost = $derived(tracksToPurchase.length * 33); // 33 KALE per token
    const totalCost = $derived(totalMintCost + totalPurchaseCost);
    const mintBatches = $derived(Math.ceil(tracksToMint.length / 3));
    const swapBatches = $derived(Math.ceil(tracksToPurchase.length / 3)); // Must match BATCH_SIZE in useMixtapePurchase
    const totalSignatures = $derived(mintBatches + swapBatches);
    const estimatedSeconds = $derived(totalSignatures * 10); // 10 seconds per transaction
    const estimatedMinutes = $derived(Math.floor(estimatedSeconds / 60));
    const remainingSeconds = $derived(estimatedSeconds % 60);

    const steps = $derived([
        ...(tracksToMint.length > 0
            ? [
                  {
                      id: "mint",
                      label: `Mint ${tracksToMint.length} track${tracksToMint.length === 1 ? "" : "s"}`,
                      detail: `${totalMintCost} KALE (${mintBatches} signature${mintBatches === 1 ? "" : "s"})`,
                      substeps: tracksToMint.map((t, i) => ({
                          id: `mint-${t.id}`,
                          label: `${i + 1}. ${t.title}`,
                      })),
                  },
              ]
            : []),
        ...(tracksToPurchase.length > 0
            ? [
                  {
                      id: "purchase",
                      label: `Purchase ${tracksToPurchase.length} track${tracksToPurchase.length === 1 ? "" : "s"}`,
                      detail: `${totalPurchaseCost} KALE (${swapBatches} signature${swapBatches === 1 ? "" : "s"})`,
                      substeps: tracksToPurchase.map((t, i) => ({
                          id: `purchase-${t.id}`,
                          label: `${i + 1}. ${t.title}`,
                      })),
                  },
              ]
            : []),
        {
            id: "complete",
            label: "Mixtape fully owned!",
            detail: "",
        },
    ]);

    let turnstileToken = $state("");
    let needsVerification = $state(false);
    let resolveTokenPromise: ((token: string) => void) | null = null;

    export async function requestNewToken(): Promise<string> {
        return new Promise((resolve) => {
            turnstileToken = "";
            needsVerification = true;
            resolveTokenPromise = resolve;
        });
    }

    function handleClose() {
        if (!isProcessing) {
            dispatch("close");
        }
    }

    function handleConfirm() {
        dispatch("confirm", { token: turnstileToken });
    }
</script>

{#if isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onclick={handleClose}
    >
        <div
            class="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onclick={(e) => e.stopPropagation()}
        >
            <!-- Header -->
            <div
                class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700 bg-slate-900 p-6"
            >
                <div>
                    <h2 class="text-2xl font-bold text-white">
                        Purchase Mixtape
                    </h2>
                    <p class="mt-1 text-sm text-slate-400">
                        {#if tracksToMint.length === 0 && tracksToPurchase.length === 0}
                            You already own all tracks!
                        {:else}
                            Review and confirm your purchase
                        {/if}
                    </p>
                </div>
                {#if !isProcessing}
                    <button
                        class="text-slate-400 hover:text-white transition-colors"
                        onclick={handleClose}
                        aria-label="Close"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            class="w-6 h-6"
                        >
                            <path
                                d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
                            />
                        </svg>
                    </button>
                {/if}
            </div>

            <!-- Content -->
            <div class="p-6 space-y-6">
                {#if tracksToMint.length === 0 && tracksToPurchase.length === 0}
                    <div class="text-center py-8">
                        <div
                            class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-400/20 mb-4"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                class="w-8 h-8 text-emerald-400"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </div>
                        <p class="text-lg font-semibold text-white">All Set!</p>
                        <p class="text-sm text-slate-400 mt-2">
                            You already own all tracks in this mixtape.
                        </p>
                    </div>
                {:else}
                    <!-- Summary Card -->
                    <div
                        class="rounded-xl border border-slate-700 bg-slate-800/50 p-4"
                    >
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p class="text-slate-400">Tracks to acquire</p>
                                <p class="text-xl font-bold text-white">
                                    {tracksToMint.length +
                                        tracksToPurchase.length}
                                </p>
                            </div>
                            <div>
                                <p class="text-slate-400">Total cost</p>
                                <p class="text-xl font-bold text-lime-400">
                                    {totalCost} KALE
                                </p>
                            </div>
                            <div>
                                <p class="text-slate-400">
                                    Signatures required
                                </p>
                                <p class="text-lg font-semibold text-white">
                                    {totalSignatures}
                                </p>
                            </div>
                            <div>
                                <p class="text-slate-400">Estimated time</p>
                                <p class="text-lg font-semibold text-white">
                                    {#if estimatedMinutes > 0}
                                        ~{estimatedMinutes}min {remainingSeconds}s
                                    {:else}
                                        ~{remainingSeconds}s
                                    {/if}
                                </p>
                            </div>
                        </div>
                    </div>

                    {#if !isProcessing && totalSignatures > 1}
                        <div
                            class="rounded-lg border border-slate-600/50 bg-slate-800/30 p-3"
                        >
                            <p class="text-xs text-slate-400">
                                💡 You'll sign transactions in batches. If you
                                cancel, you can retry without re-opening this
                                modal.
                            </p>
                        </div>
                    {/if}

                    <!-- Steps -->
                    <div class="space-y-3">
                        {#each steps as step, stepIndex}
                            {@const isCompleted = completedSteps.has(step.id)}
                            {@const isCurrent = currentStep === step.id}
                            {@const isLast = stepIndex === steps.length - 1}
                            {@const isNext =
                                !isCompleted &&
                                !isCurrent &&
                                isProcessing &&
                                stepIndex > 0}

                            <div
                                class="rounded-xl border transition-colors {isCurrent
                                    ? 'border-lime-400 bg-lime-400/10'
                                    : isCompleted
                                      ? 'border-emerald-400 bg-emerald-400/5'
                                      : 'border-slate-700 bg-slate-800/50'}"
                            >
                                <div class="p-4">
                                    <div class="flex items-start gap-3">
                                        <div class="flex-shrink-0 mt-0.5">
                                            {#if isCompleted}
                                                <div
                                                    class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400"
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        viewBox="0 0 20 20"
                                                        fill="currentColor"
                                                        class="w-4 h-4 text-slate-900"
                                                    >
                                                        <path
                                                            fill-rule="evenodd"
                                                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                                            clip-rule="evenodd"
                                                        />
                                                    </svg>
                                                </div>
                                            {:else if isCurrent}
                                                <Loader classNames="w-6 h-6" />
                                            {:else}
                                                <div
                                                    class="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-900"
                                                >
                                                    <span
                                                        class="text-xs font-semibold text-slate-400"
                                                        >{stepIndex + 1}</span
                                                    >
                                                </div>
                                            {/if}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p
                                                class="font-semibold {isCurrent
                                                    ? 'text-lime-400'
                                                    : isCompleted
                                                      ? 'text-emerald-400'
                                                      : isNext
                                                        ? 'text-slate-300'
                                                        : 'text-white'}"
                                            >
                                                {step.label}
                                            </p>
                                            {#if step.detail}
                                                <p
                                                    class="text-sm text-slate-400 mt-0.5"
                                                >
                                                    {step.detail}
                                                </p>
                                            {/if}

                                            {#if step.substeps && (isCurrent || isCompleted) && isProcessing}
                                                <div
                                                    class="mt-3 space-y-1.5 pl-2 border-l-2 {isCurrent
                                                        ? 'border-lime-400/30'
                                                        : 'border-emerald-400/30'}"
                                                >
                                                    {#each step.substeps as substep}
                                                        {@const subCompleted =
                                                            completedSteps.has(
                                                                substep.id,
                                                            )}
                                                        <div
                                                            class="flex items-center gap-2 text-sm"
                                                        >
                                                            {#if subCompleted}
                                                                <svg
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    viewBox="0 0 20 20"
                                                                    fill="currentColor"
                                                                    class="w-4 h-4 text-emerald-400 flex-shrink-0"
                                                                >
                                                                    <path
                                                                        fill-rule="evenodd"
                                                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                                                                        clip-rule="evenodd"
                                                                    />
                                                                </svg>
                                                                <span
                                                                    class="text-emerald-400"
                                                                    >{substep.label}</span
                                                                >
                                                            {:else}
                                                                <svg
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    viewBox="0 0 20 20"
                                                                    fill="currentColor"
                                                                    class="w-4 h-4 text-slate-600 flex-shrink-0"
                                                                >
                                                                    <circle
                                                                        cx="10"
                                                                        cy="10"
                                                                        r="3"
                                                                    />
                                                                </svg>
                                                                <span
                                                                    class="text-slate-400"
                                                                    >{substep.label}</span
                                                                >
                                                            {/if}
                                                        </div>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>

                    {#if isProcessing}
                        <div
                            class="rounded-lg border border-blue-500/50 bg-blue-500/10 p-4"
                        >
                            <div class="flex items-start gap-3">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                                <div class="flex-1">
                                    <p
                                        class="text-sm font-medium text-blue-400"
                                    >
                                        Processing...
                                    </p>
                                    <p class="text-xs text-slate-400 mt-1">
                                        You'll be asked to sign {totalSignatures}
                                        transaction{totalSignatures === 1
                                            ? ""
                                            : "s"}. Keep this window open.
                                    </p>
                                </div>
                            </div>
                        </div>
                    {/if}
                {/if}
            </div>

            <!-- Footer -->
            <div
                class="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-slate-700 bg-slate-900 p-6"
            >
                {#if tracksToMint.length > 0 || tracksToPurchase.length > 0}
                    {#if !isDirectRelayer && (!isProcessing || needsVerification)}
                        {#if needsVerification}
                            <p
                                class="text-lime-400 text-sm mb-2 text-center animate-pulse"
                            >
                                Please verify you are human to continue...
                            </p>
                        {/if}
                        <div class="flex justify-center w-full mb-2">
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
                            />
                        </div>
                    {/if}
                {/if}

                <div class="flex gap-3 w-full">
                    {#if tracksToMint.length > 0 || tracksToPurchase.length > 0}
                        {#if !isProcessing}
                            <button
                                class="flex-1 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
                                onclick={handleClose}
                            >
                                Cancel
                            </button>
                            <button
                                class="flex-1 rounded-lg bg-lime-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-lime-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                onclick={handleConfirm}
                                disabled={!isDirectRelayer && !turnstileToken}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    class="w-5 h-5"
                                >
                                    <path
                                        d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.18 3a65.25 65.25 0 0113.36 1.412.75.75 0 01.58.875 48.645 48.645 0 01-1.618 6.2.75.75 0 01-.712.513H6a2.503 2.503 0 00-2.292 1.5H17.25a.75.75 0 010 1.5H2.76a.75.75 0 01-.748-.807 4.002 4.002 0 012.716-3.486L3.626 2.716a.25.25 0 00-.248-.216H1.75A.75.75 0 011 1.75zM6 17.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                                    />
                                </svg>
                                Confirm Purchase
                            </button>
                        {:else}
                            <div
                                class="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-400 text-center"
                            >
                                Processing... Please wait
                            </div>
                        {/if}
                    {:else}
                        <button
                            class="flex-1 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-600 transition-colors"
                            onclick={handleClose}
                        >
                            Close
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}
