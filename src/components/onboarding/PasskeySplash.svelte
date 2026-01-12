<script lang="ts">
    import { onMount } from "svelte";
    import { fade, fly, scale } from "svelte/transition";
    import { useAuthentication } from "../../hooks/useAuthentication";
    import { userState } from "../../stores/user.svelte";
    import { setBackgroundAnimations } from "../../stores/background.svelte.ts";
    import Loader from "../ui/Loader.svelte";

    // State
    let step = $state<"intro" | "username" | "processing" | "success">("intro");
    let username = $state("");
    let error = $state<string | null>(null);
    // Audio removed per user request

    const authHook = useAuthentication();

    // One-liners
    const TAGLINES = [
        "find your next favorite.",
        "make music here.",
        "save the ones you love.",
        "support the humans\nbehind the sound.",
        "it's free suno.",
        "create without limits.",
        "your sound, your rules.",
        "listen to something new.",
        "simple, open, yours.",
        "collect what\nyou vibe with.",
    ];
    let taglineIndex = $state(0);
    let visibleCount = $state(0);
    // let isTyping = $state(false); // Unused in this version if we don't blink a cursor moving

    const PLACEHOLDERS = [
        "vip_access",
        "backstage_pass",
        "front_row",
        "inner_circle",
        "all_access",
        "guest_list",
        "producer_pass",
        "studio_key",
        "sound_check",
    ];
    let placeholderIndex = $state(0);

    $effect(() => {
        // ... (lines 49-67 unused in this chunk) ...
        const nextInterval = setTimeout(() => {
            taglineIndex = (taglineIndex + 1) % TAGLINES.length;
        }, 4000);

        // Rotate placeholders every 2.5s
        const placeholderInterval = setInterval(() => {
            placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length;
        }, 2500);

        return () => {
            // ... (unused)
            clearTimeout(nextInterval);
            clearInterval(placeholderInterval);
        };
    });

// ...

            {:else if step === "username"}
                <div
                    class="w-full max-w-xs flex flex-col gap-4 items-center"
                    in:scale={{ duration: 300, start: 0.95 }}
                >
                    <div
                        class="text-lime-400 font-pixel uppercase tracking-widest text-sm mb-1"
                    >
                        All Access Pass
                    </div>
                    <div class="text-white/60 font-pixel text-[10px] text-center mb-4 leading-relaxed">
                        Secure your connection to the underground.<br/>
                        A private handle for the art you value.
                    </div>

                    <input
                        type="text"
                        bind:value={username}
                        placeholder={PLACEHOLDERS[placeholderIndex]}
                        class="w-full bg-white/5 border-2 border-white/20 rounded-lg py-3 px-4 text-center font-pixel text-white uppercase tracking-widest placeholder:text-white/20 text-xs
                            focus:border-[#d836ff] focus:outline-none focus:bg-white/10 transition-colors"
                        autofocus
                        onkeydown={(e) => e.stopPropagation()}
                    />

                    {#if error}
                        <p
                            class="text-rose-400 text-xs font-mono text-center bg-rose-500/10 p-2 rounded w-full"
                        >
                            {error}
                        </p>
                    {/if}

                    <div class="flex w-full gap-3 mt-4">
                        <button
                            onclick={() => (step = "intro")}
                            class="flex-1 py-3 border-2 border-white/10 text-white/60 font-pixel uppercase text-xs rounded-lg hover:bg-white/5 hover:text-white transition-colors"
                        >
                            Back
                        </button>
                        <button
                            onclick={submitUsername}
                            disabled={!username.trim()}
                            class="flex-[2] py-3 bg-lime-500 text-black font-pixel font-bold uppercase text-xs rounded-lg shadow-[0_4px_0_rgba(65,130,22,0.6)]
                               hover:bg-lime-400 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all"
                        >
                            Start Game
                        </button>
                    </div>
                </div>
            {:else if step === "processing"}
                <div class="flex flex-col items-center gap-4" in:fade>
                    <Loader classNames="w-12 h-12" textColor="text-[#d836ff]" />
                    <p
                        class="text-[#d836ff] font-pixel animate-pulse text-xs uppercase tracking-widest"
                    >
                        Wait...
                    </p>
                </div>
            {:else if step === "success"}
                <div
                    class="flex flex-col items-center gap-4 text-center"
                    in:scale
                >
                    <div class="text-4xl">🎉</div>
                    <h2 class="text-2xl font-pixel uppercase text-lime-400">
                        Ready!
                    </h2>
                    <p class="text-white/60 font-pixel text-xs">
                        Entering the ecosystem...
                    </p>
                </div>
            {/if}
        </div>

        <!-- FOOTER CONTROLS REMOVED -->
    </main>
</div>

<style>
    /* Safely handle specific safe areas */
    .safe-area-inset-bottom {
        padding-bottom: env(safe-area-inset-bottom, 24px);
    }
</style>
