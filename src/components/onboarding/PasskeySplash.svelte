<script lang="ts">
    import { onMount } from "svelte";
    import { fade, fly, scale } from "svelte/transition";
    import { useAuthentication } from "../../hooks/useAuthentication";
    import { userState } from "../../stores/user.svelte";
    import Loader from "../ui/Loader.svelte";

    // State
    let step = $state<"intro" | "username" | "processing" | "success">("intro");
    let username = $state("");
    let error = $state<string | null>(null);
    let audioMuted = $state(true);
    let audioInitialized = $state(false);
    let audioEl: HTMLAudioElement;

    const authHook = useAuthentication();

    // One-liners
    const TAGLINES = [
        "find your next favorite.",
        "make music here.",
        "save the ones you love.",
        "support the humans behind the sound.",
    ];
    let taglineIndex = $state(0);

    // Rotate taglines
    onMount(() => {
        // Check if already auth'd or skipped - redirect if so
        const skipped = localStorage.getItem("smol_passkey_skipped");
        if (userState.contractId || (skipped && step !== "success")) {
            if (!userState.contractId && skipped) {
                // Only skip if explicitly skipped, but if they came here manually allow it?
                // Actually scope says: "route new users... returning users bypass"
                // If I am here, I might have been redirected.
                // If I am already auth'd, go home.
            }
            if (userState.contractId) {
                window.location.href = "/";
                return;
            }
        }

        const interval = setInterval(() => {
            taglineIndex = (taglineIndex + 1) % TAGLINES.length;
        }, 3000);

        // Analytics
        logEvent("passkey_splash_view", {
            variant: "arcade",
            is_new_user: !localStorage.getItem("smol_passkey_skipped"),
            platform: getPlatform(),
        });

        return () => clearInterval(interval);
    });

    function getPlatform() {
        if (typeof navigator === "undefined") return "other";
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return "ios";
        if (
            /Macintosh/.test(navigator.userAgent) &&
            navigator.maxTouchPoints > 0
        )
            return "ios"; // iPad OS 13+
        return "desktop";
    }

    function logEvent(name: string, payload: any = {}) {
        // In a real app, send to analytics backend
        console.log(`[Analytics] ${name}`, payload);
    }

    // Audio Logic
    function toggleAudio() {
        if (!audioInitialized) {
            // Lazy load / init audio context if needed
            // ensuring user gesture
            audioInitialized = true;
            // If we had a sound file, we play it. For now, just toggle state to show UI logic.
        }
        audioMuted = !audioMuted;
        if (audioEl) {
            if (audioMuted) audioEl.pause();
            else audioEl.play().catch(() => {});
        }
    }

    async function handleCreate() {
        logEvent("passkey_create_click");
        step = "username";
    }

    async function submitUsername() {
        if (!username.trim()) return;
        step = "processing";
        error = null;

        try {
            await authHook.signUp(username);
            logEvent("passkey_create_success");
            step = "success";
            // Redirect after short delay
            setTimeout(() => {
                window.location.href = "/";
            }, 1500);
        } catch (e: any) {
            console.error(e);
            error = e.message || "Failed to create passkey";
            logEvent("passkey_create_error", { code: error });
            step = "username";
        }
    }

    async function handleLogin() {
        logEvent("passkey_login_click");
        step = "processing";
        error = null;
        try {
            await authHook.login();
            logEvent("passkey_login_success");
            step = "success";
            setTimeout(() => {
                window.location.href = "/";
            }, 500);
        } catch (e: any) {
            console.error(e);
            error = "Login cancelled or failed";
            logEvent("passkey_login_error", { code: e.message });
            step = "intro";
        }
    }

    function handleSkip() {
        logEvent("passkey_skip_click");
        localStorage.setItem("smol_passkey_skipped", "true");
        localStorage.setItem("smol_onboarding_complete", "true"); // Mark onboarding as done
        window.location.href = "/";
    }

    function handleKeydown(e: KeyboardEvent) {
        if (step === "intro") {
            if (e.key === "Enter" || e.key === " ") {
                handleCreate();
            }
        } else if (step === "username") {
            if (e.key === "Enter") {
                submitUsername();
            }
            if (e.key === "Escape") {
                step = "intro";
            }
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
    class="fixed inset-0 bg-[#050505] text-white overflow-hidden font-mono z-[9999]"
>
    <!-- Background Art / Gradient -->
    <!-- Background Art -->
    <div class="absolute inset-0 z-0">
        <img
            src="/kale_landscape.png"
            alt="Pixel Art Kale Field"
            class="w-full h-full object-cover opacity-50"
            style="image-rendering: pixelated;"
        />
        <!-- Vignette/Darken for contrast -->
        <div class="absolute inset-0 bg-black/40 mix-blend-multiply"></div>
        <div
            class="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent"
        ></div>
    </div>

    <!-- CRT Scanline Effect -->
    <div
        class="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] contrast-[100%] brightness-100 opacity-20"
    ></div>

    <!-- Decorative Game Cabinet Frame (Subtle Vignette) -->
    <div
        class="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.8)_100%)] z-20"
    ></div>

    <main
        class="relative z-30 h-full flex flex-col items-center justify-center p-6 safe-area-inset-bottom"
    >
        <!-- HEADER -->
        <div class="mb-12 text-center" in:fade={{ duration: 800 }}>
            <!-- Rotating One-Liner -->
            <div class="h-8 flex items-center justify-center mb-6">
                {#key taglineIndex}
                    <p
                        in:fly={{ y: 10, duration: 400, delay: 200 }}
                        out:fly={{ y: -10, duration: 400 }}
                        class="text-lime-400 font-pixel uppercase tracking-widest text-xs md:text-sm drop-shadow-[0_0_10px_rgba(132,204,22,0.5)]"
                    >
                        {TAGLINES[taglineIndex]}
                    </p>
                {/key}
            </div>

            <h1
                class="text-4xl md:text-6xl font-pixel font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b from-lime-400 to-lime-600 drop-shadow-[0_4px_0_rgba(132,204,22,0.2)]"
            >
                SMOL.XYZ
            </h1>
        </div>

        <!-- CONTENT CONTAINER -->
        <div
            class="w-full max-w-md relative min-h-[300px] flex flex-col items-center"
        >
            {#if step === "intro"}
                <div
                    class="w-full flex flex-col items-center gap-6"
                    in:fade={{ duration: 300 }}
                >
                    <!-- PRIMARY CTA: CREATE PASSKEY -->
                    <button
                        onclick={handleCreate}
                        class="group relative w-full max-w-xs py-5 px-8 bg-[#1d293d] text-lime-400 font-pixel font-bold uppercase tracking-widest text-sm md:text-base rounded-lg
                           hover:bg-[#2a3b55] hover:-translate-y-1 hover:shadow-[0_8px_0_rgba(15,23,42,1)]
                           active:translate-y-1 active:shadow-none active:bg-[#151e2e]
                           transition-all duration-100 shadow-[0_4px_0_rgba(15,23,42,1)]
                           focus:outline-none focus:ring-4 focus:ring-lime-400/20 border-2 border-lime-400/20"
                        aria-label="Create Passkey"
                    >
                        <span
                            class="relative z-10 flex items-center justify-center gap-3"
                        >
                            <span class="text-xl">★</span> INSERT $KALE
                        </span>
                    </button>

                    <!-- SECONDARY: LOGIN -->
                    <button
                        onclick={handleLogin}
                        class="text-white/60 hover:text-white font-pixel uppercase tracking-wide text-xs py-2 px-4 rounded transition-colors
                           focus:outline-none focus:text-white focus:bg-white/10"
                    >
                        Have a passkey? Login
                    </button>

                    <!-- ESCAPE HATCH -->
                    <button
                        onclick={handleSkip}
                        class="mt-8 text-white/30 hover:text-white/50 font-mono uppercase text-[10px] tracking-widest
                           focus:outline-none focus:text-white"
                    >
                        Skip for now
                    </button>
                </div>
            {:else if step === "username"}
                <div
                    class="w-full max-w-xs flex flex-col gap-4 items-center"
                    in:scale={{ duration: 300, start: 0.95 }}
                >
                    <div
                        class="text-white/80 font-pixel uppercase tracking-wide text-xs mb-2"
                    >
                        Enter Callsign
                    </div>

                    <input
                        type="text"
                        bind:value={username}
                        placeholder="USERNAME"
                        class="w-full bg-white/5 border-2 border-white/20 rounded-lg py-3 px-4 text-center font-pixel text-white uppercase tracking-widest placeholder:text-white/20
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
                    <p class="text-white/60 font-mono text-xs">
                        Entering the ecosystem...
                    </p>
                </div>
            {/if}
        </div>

        <!-- FOOTER CONTROLS -->
        <div class="absolute bottom-6 right-6 z-40">
            <button
                onclick={toggleAudio}
                class="p-3 text-white/20 hover:text-white transition-colors font-pixel text-[10px] uppercase"
                aria-label={audioMuted ? "Unmute Audio" : "Mute Audio"}
            >
                [{audioMuted ? "MUTE" : "SOUND ON"}]
            </button>
        </div>
    </main>
</div>

<style>
    /* Safely handle specific safe areas */
    .safe-area-inset-bottom {
        padding-bottom: env(safe-area-inset-bottom, 24px);
    }
</style>
