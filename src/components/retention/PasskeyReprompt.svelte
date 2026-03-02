<script lang="ts">
    import { onMount, tick } from "svelte";
    import { fade, fly } from "svelte/transition";
    import { userState } from "../../stores/user.svelte.ts";
    import { getRepromptMessage } from "../../utils/reprompt-messages";

    let show = $state(false);
    let message = $state("");
    let msgIndex = $state(0);

    const COOLDOWN_DAYS = 3;
    const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    function handlePositiveAction(e?: Event) {
        if (userState.contractId) return; // Already auth'd
        if (show) return; // Already showing

        const isForced = e?.type === "smol:promote-passkey";

        const lastShown = parseInt(
            localStorage.getItem("smol_reprompt_timestamp") || "0",
            10,
        );
        const now = Date.now();

        if (!isForced && now - lastShown < COOLDOWN_MS) return;

        // Determine category based on event
        let category: "play" | "like" | "create" = "play";
        if (
            e?.type === "smol:action-like" ||
            e?.type === "smol:promote-passkey"
        ) {
            category = "like";
        } else if (e?.type === "smol:action-tip") {
            category = "like";
        }

        // Show it
        const { msg, index } = getRepromptMessage(category);
        message = msg;
        msgIndex = index;
        show = true;

        // Log view
        console.log("[Analytics] passkey_reprompt_view", {
            message_index: index,
            platform: "web",
            forced: isForced,
        });
    }

    function handleNavigate() {
        // Log click
        console.log("[Analytics] passkey_reprompt_accept", {
            message_index: msgIndex,
        });
        window.location.href = "/onboarding/passkey";
    }

    function handleDismiss() {
        show = false;
        // Set timestamp
        localStorage.setItem("smol_reprompt_timestamp", Date.now().toString());

        console.log("[Analytics] passkey_reprompt_dismiss", {
            message_index: msgIndex,
        });
    }

    onMount(() => {
        window.addEventListener("smol:action-play", handlePositiveAction);
        window.addEventListener("smol:action-like", handlePositiveAction);
        window.addEventListener("smol:action-tip", handlePositiveAction);
        window.addEventListener("smol:promote-passkey", handlePositiveAction);
        // window.addEventListener("smol:action-playlist-add", handlePositiveAction); // If implemented

        return () => {
            window.removeEventListener(
                "smol:action-play",
                handlePositiveAction,
            );
            window.removeEventListener(
                "smol:action-like",
                handlePositiveAction,
            );
            window.removeEventListener("smol:action-tip", handlePositiveAction);
            window.removeEventListener(
                "smol:promote-passkey",
                handlePositiveAction,
            );
        };
    });
</script>

{#if show}
    <div
        transition:fly={{ y: 50, duration: 400 }}
        class="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:bottom-8 z-50 w-full md:w-96"
    >
        <div
            class="bg-[#1a1a1a] border border-[#d836ff]/30 shadow-[0_0_30px_rgba(216,54,255,0.15)] rounded-xl p-5 md:p-6 flex flex-col gap-4 relative overflow-hidden"
        >
            <!-- Retro Accent -->
            <div class="absolute top-0 left-0 right-0 h-1 bg-[#d836ff]"></div>

            <!-- Migration Warning -->
            <div class="text-amber-300/90 text-[9px] font-pixel uppercase tracking-wide flex items-center gap-1.5 -mt-1 mb-1">
                <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z" />
                </svg>
                <span>Upgrading passkeys — browse free or use <a href="https://smol.xyz" class="underline" target="_blank" rel="noopener">smol.xyz</a></span>
            </div>

            <p
                class="text-white/90 font-pixel text-xs md:text-sm leading-relaxed lowercase tracking-wide"
            >
                "{message}"
            </p>

            <div class="flex items-center gap-3 mt-1">
                <button
                    onclick={handleNavigate}
                    class="flex-1 bg-[#d836ff]/10 hover:bg-[#d836ff]/20 text-[#d836ff] border border-[#d836ff]/50 px-4 py-2.5 rounded-lg font-pixel text-[10px] md:text-xs uppercase tracking-widest transition-all active:scale-95 text-center"
                >
                    Create Passkey
                </button>
                <button
                    onclick={handleDismiss}
                    class="px-4 py-2.5 text-white/40 hover:text-white transition-colors font-mono text-xs"
                >
                    Dismiss
                </button>
            </div>
        </div>
    </div>
{/if}
