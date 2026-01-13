<script lang="ts">
    let acceptedRisk = $state(false);
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
        <!-- The Swapper UI (Coming in LABS-102) -->
        <div
            class="flex flex-col items-center justify-center py-12 gap-4 animate-in fade-in slide-in-from-bottom-4"
        >
            <div
                class="w-16 h-16 border-2 border-dashed border-[#333] rounded-full flex items-center justify-center animate-spin-slow"
            >
                <span class="text-2xl">⚡</span>
            </div>
            <p
                class="text-xs font-mono text-[#555] uppercase tracking-widest text-center"
            >
                Module Loaded.<br />
                <span class="text-[#9ae600]">Waiting for Phase 2 Uplink...</span
                >
            </p>
        </div>
    {/if}
</div>

<style>
    @keyframes spin-slow {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
    .animate-spin-slow {
        animation: spin-slow 12s linear infinite;
    }
</style>
