<script lang="ts">
    import { onMount } from "svelte";
    import { fade, fly, scale } from "svelte/transition";
    import { useAuthentication } from "../../hooks/useAuthentication";
    import { userState } from "../../stores/user.svelte.ts";
    import Loader from "../ui/Loader.svelte";
    import { Turnstile } from "svelte-turnstile";

    // State
    let step = $state<"intro" | "username" | "processing" | "success">("intro");
    let username = $state("");
    let error = $state<string | null>(null);
    let turnstileToken = $state("");

    const authHook = useAuthentication();

    // Feature highlights with pixel art SVG icons
    const FEATURES = [
        {
            icon: "music",
            title: "Create Music",
            items: [
                "Type a prompt, get a full song",
                "AI-powered in ~6 minutes",
                "No experience needed",
            ],
        },
        {
            icon: "kale",
            title: "Earn Tips",
            items: [
                "Mint tracks on-chain",
                "Receive $KALE from fans",
                "Build your artist profile",
            ],
        },
        {
            icon: "star",
            title: "Unlock Cosmetics",
            items: [
                "VIP badges & styles",
                "Custom player themes",
                "Early access perks",
            ],
        },
    ];

    // Rotating taglines
    const TAGLINES = [
        "got a song in your heart?",
        "music is for everyone.",
        "no instruments needed.",
        "your ideas, realized.",
        "imagine it, hear it.",
        "type it, play it.",
        "from words to music.",
        "creativity unlocked.",
        "everyone's a songwriter.",
        "no skills required.",
        "the studio in your pocket.",
        "insert prompt, receive banger.",
        "spawn your soundtrack.",
        "discover your sound.",
        "mint your moment.",
        "own what you create.",
    ];
    let taglineIndex = $state(0);

    onMount(() => {
        // Redirect if already auth'd
        if (userState.contractId) {
            window.location.href = "/create";
            return;
        }

        const interval = setInterval(() => {
            taglineIndex = (taglineIndex + 1) % TAGLINES.length;
        }, 3500);

        return () => clearInterval(interval);
    });

    async function handlePasskeyLogin() {
        // Try login first (existing passkey)
        error = null;
        try {
            await authHook.login();
            // If successful, redirect happens automatically
            window.location.href = "/create";
        } catch (e: any) {
            // Login failed/cancelled - user likely doesn't have a passkey yet
            // Fall back to account creation flow
            console.log("Login failed, falling back to signup:", e.message);
            step = "username";
        }
    }

    async function submitUsername() {
        if (!username.trim()) return;
        step = "processing";
        error = null;

        try {
            await authHook.signUp(username, turnstileToken);
            step = "success";
            setTimeout(() => {
                window.location.href = "/create";
            }, 1500);
        } catch (e: any) {
            console.error(e);
            error = e.message || "Failed to create passkey";
            step = "username";
        }
    }

    function handleSkip() {
        localStorage.setItem("smol_passkey_skipped", "true");
        window.location.href = "/";
    }

    function handleKeydown(e: KeyboardEvent) {
        if (step === "intro") {
            if (e.key === "Enter" || e.key === " ") {
                handlePasskeyLogin();
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
    function typewriter(node: HTMLElement, { speed = 1 }: { speed?: number }) {
        const text = node.textContent ?? "";
        const duration = text.length * 50 * (1 / speed); // ~50ms per char

        return {
            duration,
            tick: (t: number) => {
                const i = Math.trunc(text.length * t);
                node.textContent = text.slice(0, i);
            },
        };
    }

    // ... existing onMount ...
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-transparent text-white overflow-y-auto font-mono">
    <!-- CRT Scanline Effect -->
    <div
        class="pointer-events-none fixed inset-0 z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-10"
    ></div>

    <main
        class="relative z-30 flex flex-col items-center justify-center min-h-screen px-4 py-4 safe-area-inset-bottom"
    >
        <!-- HEADER -->
        <div
            class="text-center mb-2 md:mb-6 shrink-0"
            in:fade={{ duration: 800 }}
        >
            <!-- Rotating Tagline -->
            <div
                class="h-5 md:h-8 flex items-center justify-center mb-1 md:mb-4"
            >
                {#key taglineIndex}
                    <p
                        in:typewriter={{ speed: 1.2 }}
                        out:fade={{ duration: 200 }}
                        class="text-lime-400 font-pixel uppercase tracking-widest text-[10px] md:text-sm drop-shadow-[0_0_10px_rgba(132,204,22,0.5)] border-r-2 border-lime-400 pr-1 animate-[blink_1s_step-end_infinite]"
                    >
                        {TAGLINES[taglineIndex]}
                    </p>
                {/key}
            </div>

            <h1
                class="text-xl md:text-4xl font-pixel font-black tracking-tight uppercase text-transparent bg-clip-text bg-gradient-to-b from-lime-400 to-lime-600 drop-shadow-[0_4px_0_rgba(132,204,22,0.2)] mb-1 md:mb-3"
            >
                Make Music Here
            </h1>
            <p
                class="text-white/60 font-pixel text-[10px] md:text-sm max-w-xs md:max-w-md mx-auto leading-relaxed hidden md:block"
            >
                SMOL turns your ideas into songs. No instruments, no experience
                needed — just your imagination.
            </p>
        </div>

        <!-- FEATURE CARDS -->
        {#if step === "intro"}
            <div
                class="grid grid-cols-3 gap-2 md:gap-4 w-full max-w-2xl mb-3 md:mb-5 shrink-0"
                in:fade={{ duration: 500, delay: 200 }}
            >
                {#each FEATURES as feature, i}
                    <div
                        class="relative bg-black/30 backdrop-blur-sm border border-white/10 rounded-lg p-2 md:p-4 hover:border-lime-500/30 transition-all hover:bg-black/40 group"
                        in:fly={{ y: 20, duration: 400, delay: 300 + i * 100 }}
                    >
                        <!-- Glow on hover -->
                        <div
                            class="absolute inset-0 rounded-xl bg-gradient-to-br from-lime-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                        ></div>

                        <div
                            class="relative z-10 flex flex-col items-center md:items-start"
                        >
                            <!-- Custom Pixel Art Icons -->
                            <div
                                class="w-6 h-6 md:w-10 md:h-10 mb-1 md:mb-3 text-lime-400"
                            >
                                {#if feature.icon === "music"}
                                    <!-- Pixel Music Note -->
                                    <svg
                                        viewBox="0 0 16 16"
                                        class="w-full h-full"
                                        fill="currentColor"
                                        class:text-lime-400={true}
                                    >
                                        <rect
                                            x="10"
                                            y="1"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="12"
                                            y="1"
                                            width="2"
                                            height="4"
                                        />
                                        <rect
                                            x="10"
                                            y="3"
                                            width="2"
                                            height="10"
                                        />
                                        <rect
                                            x="4"
                                            y="10"
                                            width="6"
                                            height="2"
                                        />
                                        <rect
                                            x="4"
                                            y="12"
                                            width="4"
                                            height="2"
                                        />
                                        <rect
                                            x="2"
                                            y="10"
                                            width="2"
                                            height="4"
                                        />
                                    </svg>
                                {:else if feature.icon === "kale"}
                                    <!-- Pixel Kale/Coin -->
                                    <svg
                                        viewBox="0 0 16 16"
                                        class="w-full h-full"
                                        fill="currentColor"
                                        class:text-lime-400={true}
                                    >
                                        <rect
                                            x="5"
                                            y="1"
                                            width="6"
                                            height="2"
                                        />
                                        <rect
                                            x="3"
                                            y="3"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="11"
                                            y="3"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="1"
                                            y="5"
                                            width="2"
                                            height="6"
                                        />
                                        <rect
                                            x="13"
                                            y="5"
                                            width="2"
                                            height="6"
                                        />
                                        <rect
                                            x="3"
                                            y="11"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="11"
                                            y="11"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="5"
                                            y="13"
                                            width="6"
                                            height="2"
                                        />
                                        <rect
                                            x="6"
                                            y="5"
                                            width="4"
                                            height="2"
                                        />
                                        <rect
                                            x="7"
                                            y="7"
                                            width="2"
                                            height="4"
                                        />
                                    </svg>
                                {:else if feature.icon === "star"}
                                    <!-- Pixel Star -->
                                    <svg
                                        viewBox="0 0 16 16"
                                        class="w-full h-full"
                                        fill="currentColor"
                                        class:text-lime-400={true}
                                    >
                                        <rect
                                            x="7"
                                            y="1"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="7"
                                            y="3"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="5"
                                            y="5"
                                            width="6"
                                            height="2"
                                        />
                                        <rect
                                            x="1"
                                            y="5"
                                            width="4"
                                            height="2"
                                        />
                                        <rect
                                            x="11"
                                            y="5"
                                            width="4"
                                            height="2"
                                        />
                                        <rect
                                            x="3"
                                            y="7"
                                            width="10"
                                            height="2"
                                        />
                                        <rect
                                            x="4"
                                            y="9"
                                            width="8"
                                            height="2"
                                        />
                                        <rect
                                            x="3"
                                            y="11"
                                            width="3"
                                            height="2"
                                        />
                                        <rect
                                            x="10"
                                            y="11"
                                            width="3"
                                            height="2"
                                        />
                                        <rect
                                            x="2"
                                            y="13"
                                            width="2"
                                            height="2"
                                        />
                                        <rect
                                            x="12"
                                            y="13"
                                            width="2"
                                            height="2"
                                        />
                                    </svg>
                                {/if}
                            </div>
                            <h3
                                class="font-pixel text-lime-400 uppercase tracking-wider text-[9px] md:text-sm mb-0 md:mb-3 text-center md:text-left"
                            >
                                {feature.title}
                            </h3>
                            <ul class="space-y-1 hidden md:block">
                                {#each feature.items as item}
                                    <li
                                        class="text-white/50 text-xs font-pixel leading-relaxed flex items-start gap-2"
                                    >
                                        <span class="text-lime-500/60 mt-0.5"
                                            >›</span
                                        >
                                        <span>{item}</span>
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    </div>
                {/each}
            </div>

            <!-- CTAs -->
            <div
                class="flex flex-col items-center gap-4"
                in:fade={{ duration: 400, delay: 600 }}
            >
                <!-- SINGLE SMART PASSKEY BUTTON -->
                <button
                    onclick={handlePasskeyLogin}
                    class="group relative py-3 md:py-4 px-10 bg-lime-500 text-black font-pixel font-bold uppercase tracking-widest text-sm rounded-lg
                       hover:bg-lime-400 hover:-translate-y-1 hover:shadow-[0_8px_0_rgba(65,130,22,0.6)]
                       active:translate-y-1 active:shadow-none
                       transition-all duration-100 shadow-[0_4px_0_rgba(65,130,22,0.6)]
                       focus:outline-none focus:ring-4 focus:ring-lime-400/40"
                    aria-label="Passkey Login"
                >
                    <span class="flex items-center justify-center gap-2">
                        🔐 Passkey Login
                    </span>
                </button>

                <!-- SKIP -->
                <button
                    onclick={handleSkip}
                    class="mt-3 md:mt-6 text-white/30 hover:text-white/50 font-mono uppercase text-[10px] tracking-widest
                       focus:outline-none focus:text-white"
                >
                    Explore first
                </button>

                <!-- Migration Warning -->
                <div
                    class="mt-4 max-w-sm bg-amber-900/40 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2 text-amber-200 text-[10px] font-pixel"
                >
                    <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z" />
                    </svg>
                    <span>We're upgrading passkeys.<br/>Browse free, or use <a href="https://smol.xyz" class="underline hover:text-amber-100" target="_blank" rel="noopener">smol.xyz</a> to create.</span>
                </div>
            </div>
        {:else if step === "username"}
            <div
                class="w-full max-w-xs flex flex-col gap-4 items-center"
                in:scale={{ duration: 300, start: 0.95 }}
            >
                <div
                    class="text-white/80 font-pixel uppercase tracking-wide text-xs mb-2"
                >
                    Choose Your Artist Name
                </div>

                <input
                    type="text"
                    bind:value={username}
                    placeholder="YOUR NAME"
                    class="w-full bg-white/5 border-2 border-white/20 rounded-lg py-3 px-4 text-center font-pixel text-white uppercase tracking-widest placeholder:text-white/20
                       focus:border-lime-500 focus:outline-none focus:bg-white/10 transition-colors"
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
                        disabled={!username.trim() || !turnstileToken}
                        class="flex-[2] py-3 bg-lime-500 text-black font-pixel font-bold uppercase text-xs rounded-lg shadow-[0_4px_0_rgba(65,130,22,0.6)]
                           hover:bg-lime-400 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all"
                    >
                        Create Account
                    </button>
                </div>

                <div class="flex justify-center -mb-2 scale-75 origin-top">
                    <Turnstile
                        siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
                        on:callback={(e) => {
                            turnstileToken = e.detail.token;
                        }}
                        on:expired={() => {
                            turnstileToken = "";
                        }}
                        theme="dark"
                        appearance="interaction-only"
                    />
                </div>
            </div>
        {:else if step === "processing"}
            <div class="flex flex-col items-center gap-4" in:fade>
                <Loader classNames="w-12 h-12" textColor="text-lime-500" />
                <p
                    class="text-lime-400 font-pixel animate-pulse text-xs uppercase tracking-widest"
                >
                    Setting up your studio...
                </p>
            </div>
        {:else if step === "success"}
            <div class="flex flex-col items-center gap-4 text-center" in:scale>
                <div class="text-5xl">🎉</div>
                <h2 class="text-2xl font-pixel uppercase text-lime-400">
                    Welcome, Artist!
                </h2>
                <p class="text-white/60 font-mono text-xs">
                    Opening the studio...
                </p>
            </div>
        {/if}

        <!-- Bottom note -->
        {#if step === "intro"}
            <p
                class="mt-3 md:mt-8 text-white/30 text-[10px] font-pixel text-center max-w-sm leading-relaxed shrink-0"
            >
                Passkey login is free, instant, secure, and passwordless. Works
                across all your devices.
                <br />
                🔒Your Keys. Your Music.
            </p>
        {/if}
    </main>
</div>

<style>
    .safe-area-inset-bottom {
        padding-bottom: env(safe-area-inset-bottom, 24px);
    }
</style>
