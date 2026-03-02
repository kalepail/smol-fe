<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        context?: string; // lyrics or prompt
        contextType?: "lyrics" | "prompt" | "status";
    }

    let { context = "", contextType = "status" } = $props();

    let commentary = $state("");
    let mood = $state("analyzing");
    let loading = $state(false);

    // Fetch commentary when context changes meaningfully
    $effect(() => {
        if (context && context.length > 20) {
            fetchCommentary();
        }
    });

    async function fetchCommentary() {
        loading = true;
        try {
            const res = await fetch("/api/ai/commentary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ context, type: contextType }),
            });
            const data = await res.json();
            commentary = data.comment;
            mood = data.mood;
        } catch (e) {
            console.error("AI Director nap time", e);
        } finally {
            loading = false;
        }
    }
</script>

<div
    class="flex items-start gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 backdrop-blur-sm mt-4 transition-all duration-500 hover:border-lime-500/30"
>
    <!-- Avatar -->
    <div class="relative shrink-0">
        <div
            class="w-12 h-12 rounded-full bg-slate-800 border-2 border-lime-500 overflow-hidden flex items-center justify-center"
        >
            <span class="text-2xl">🐧</span>
        </div>
        <div
            class={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${loading ? "bg-yellow-400 animate-pulse" : "bg-green-500"}`}
        ></div>
    </div>

    <!-- Speech Bubble -->
    <div class="flex-1">
        <div class="flex items-center gap-2 mb-2 flex-wrap">
            <span
                class="text-lime-400 font-bold text-[10px] tracking-widest font-pixel"
                >AI DIRECTOR</span
            >
            <span
                class="text-[8px] text-slate-500 uppercase px-2 py-1 bg-slate-800 rounded border border-slate-700/50 font-pixel"
                >{mood}</span
            >
        </div>

        {#if commentary}
            <p
                class="text-[#FDD] text-xs leading-relaxed font-pixel tracking-wide"
            >
                "{commentary}"
            </p>
        {:else}
            <p class="text-slate-500 text-xs animate-pulse font-pixel">
                Listening to the mix...
            </p>
        {/if}
    </div>
</div>
