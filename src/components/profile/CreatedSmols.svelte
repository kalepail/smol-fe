<script lang="ts">
    import { userState } from "../../stores/user.svelte.ts";
    import Home from "../Home.svelte";
    import { useAuthentication } from "../../hooks/useAuthentication";
    import Loader from "../ui/Loader.svelte";
    import KaleEmoji from "../ui/KaleEmoji.svelte";
    import { preferences, THEMES } from "../../stores/preferences.svelte.ts";
    import { Turnstile } from "svelte-turnstile";

    // Mock ID for development (legacy ref)
    const MOCK_CID = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ2KKA";
    const MOCK_KID = "mock_key";

    // Determine address to show: Real user ID
    let viewAddress = $derived(userState.contractId);

    // Auth & Theme Logic for Splash
    const authHook = useAuthentication();
    const activeTheme = $derived(
        THEMES[preferences.glowTheme as keyof typeof THEMES],
    );
    const isTechnicolor = $derived(preferences.glowTheme === "technicolor_v2");

    let creating = $state(false);
    let loggingIn = $state(false);
    let showThemeMenu = $state(false);

    // Cleanup: Signup Form State
    let showSignupForm = $state(false);
    let username = $state("");
    let turnstileToken = $state("");

    // Background Options
    const bgOptions = [
        { name: "Kale Field", url: "/images/kale-field-bg.webp" },
        { name: "Solid Slate", url: "", style: "background-color: #1D293D;" },
        {
            name: "Valentine's ❤️",
            url: "/images/valentine_hearts.webp",
            special: true,
            tooltip: "Sign Up Before Feb 14th!",
        },
    ];
    let currentBgIndex = $state(0);

    async function handlePasskeyLogin() {
        // Try login first (existing passkey)
        loggingIn = true;
        try {
            await authHook.login();
            // Login successful - user state will update automatically
        } catch (e: any) {
            // Login failed/cancelled - user likely doesn't have a passkey yet
            // Fall back to account creation flow
            console.log("Login failed, falling back to signup:", e.message);
            loggingIn = false;
            showSignupForm = true;
        } finally {
            loggingIn = false;
        }
    }

    async function handleSignUpSubmit() {
        if (!username || !turnstileToken) return;

        creating = true;
        try {
            await authHook.signUp(username, turnstileToken);

            // Valentine's Promo Logic
            const now = new Date();
            const cutoff = new Date("2026-02-15");
            if (now < cutoff) {
                const currentUnlocks = preferences.unlockedThemes || [];
                if (!currentUnlocks.includes("valentine_2026")) {
                    preferences.unlockedThemes = [
                        ...currentUnlocks,
                        "valentine_2026",
                    ];
                    alert(
                        "❤️ UNLOCKED: Valentine's 2026 Theme! Happy Valentine's Day! ❤️",
                    );
                }
            }
        } finally {
            creating = false;
        }
    }
</script>

<div class="w-full min-h-screen bg-[#121212]">
    {#if !viewAddress}
        <!-- Pixel Theme Glassmorphism Splash (From MyProfile) -->
        <div
            class="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
        >
            <!-- Background -->
            <div
                class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-700"
                style={bgOptions[currentBgIndex].url
                    ? `background-image: url('${bgOptions[currentBgIndex].url}');`
                    : bgOptions[currentBgIndex].style}
            >
                <!-- Dark overlay -->
                <div class="absolute inset-0 bg-black/40"></div>
            </div>

            <!-- Animated pixel grid overlay -->
            <div
                class="absolute inset-0 opacity-10"
                style="background-image: 
                    linear-gradient(rgba(154, 230, 0, 0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(154, 230, 0, 0.1) 1px, transparent 1px);
                background-size: 8px 8px;"
            ></div>

            <!-- Floating sparkles animation -->
            <div class="absolute inset-0 overflow-hidden pointer-events-none">
                <div
                    class="absolute w-2 h-2 bg-lime-400/60 rounded-full animate-pulse"
                    style="top: 20%; left: 15%; animation-delay: 0s;"
                ></div>
                <div
                    class="absolute w-1 h-1 bg-purple-400/60 rounded-full animate-pulse"
                    style="top: 30%; left: 75%; animation-delay: 0.5s;"
                ></div>
                <div
                    class="absolute w-2 h-2 bg-lime-300/60 rounded-full animate-pulse"
                    style="top: 60%; left: 25%; animation-delay: 1s;"
                ></div>
                <div
                    class="absolute w-1 h-1 bg-pink-400/60 rounded-full animate-pulse"
                    style="top: 80%; left: 85%; animation-delay: 1.5s;"
                ></div>
                <div
                    class="absolute w-2 h-2 bg-lime-400/60 rounded-full animate-pulse"
                    style="top: 45%; left: 90%; animation-delay: 0.3s;"
                ></div>
            </div>

            <!-- Main Glassmorphism Card -->
            <div class="relative z-10 w-full max-w-md mx-4">
                <!-- Siri-like HDR Glow -->
                <div
                    class="absolute -inset-0.5 rounded-2xl blur-2xl opacity-100 transition-all duration-500 pointer-events-none {isTechnicolor
                        ? 'animate-color-cycle'
                        : 'animate-color-pulse'} {activeTheme.gradient
                        ? `bg-gradient-to-r ${activeTheme.gradient}`
                        : ''} saturate-200 brightness-150"
                    style={activeTheme.style || ""}
                ></div>

                <div
                    class="relative rounded-2xl p-[1px] overflow-hidden shadow-2xl"
                >
                    <!-- Animated Rainbow Background (Border) -->
                    <div
                        class="absolute inset-0 transition-all duration-500 {isTechnicolor
                            ? 'animate-color-cycle'
                            : 'animate-color-pulse'} {activeTheme.gradient
                            ? `bg-gradient-to-r ${activeTheme.gradient}`
                            : ''}"
                        style={activeTheme.style || ""}
                    ></div>

                    <!-- Liquid Slate Content -->
                    <div
                        class="rounded-2xl bg-[#1D293D]/95 backdrop-blur-3xl border border-white/20 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] p-8 h-full w-full relative z-10"
                    >
                        <!-- Kale Emoji Header -->
                        <div class="flex justify-center mb-6">
                            <div
                                class="relative w-20 h-20 flex items-center justify-center"
                            >
                                <div
                                    class="absolute inset-0 rounded-full bg-gradient-to-r from-lime-400/30 to-emerald-400/30 animate-pulse"
                                ></div>
                                <div
                                    class="relative w-16 h-16 flex items-center justify-center bg-black/50 rounded-full border border-lime-400/40"
                                >
                                    <KaleEmoji size="w-10 h-10" />
                                </div>
                            </div>
                        </div>

                        <!-- Title -->
                        <h1
                            class="text-2xl md:text-3xl font-pixel text-center text-lime-400 mb-2"
                        >
                            Your Creations
                        </h1>

                        <style>
                            @keyframes color-cycle {
                                from {
                                    filter: hue-rotate(0deg);
                                }
                                to {
                                    filter: hue-rotate(360deg);
                                }
                            }
                            @keyframes color-pulse {
                                0%,
                                100% {
                                    filter: hue-rotate(-10deg) brightness(1.1);
                                }
                                50% {
                                    filter: hue-rotate(10deg) brightness(1.3);
                                }
                            }
                            .animate-color-cycle {
                                animation: color-cycle 4s linear infinite;
                            }
                            .animate-color-pulse {
                                animation: color-pulse 4s ease-in-out infinite;
                            }
                        </style>

                        <!-- Subtitle -->
                        <p
                            class="text-center text-gray-300 mb-8 font-pixel text-sm"
                        >
                            Sign in to view your smols, manage your profile, and
                            unlock creative features powered by $KALE.
                        </p>

                        <!-- Feature pills -->
                        <div class="flex flex-wrap justify-center gap-2 mb-8">
                            <span
                                class="px-3 py-1 bg-lime-400/10 border border-lime-400/30 rounded-full text-lime-400 text-xs font-pixel"
                                >🎵 Your Songs</span
                            >
                            <span
                                class="px-3 py-1 bg-purple-400/10 border border-purple-400/30 rounded-full text-purple-400 text-xs font-pixel"
                                >💎 Mint NFTs</span
                            >
                            <span
                                class="px-3 py-1 bg-pink-400/10 border border-pink-400/30 rounded-full text-pink-400 text-xs font-pixel"
                                >🎨 Earn $KALE</span
                            >
                        </div>

                        <!-- Login/Signup Area -->
                        <div class="space-y-3">
                            {#if !showSignupForm}
                                <!-- Single Smart Passkey Button -->
                                <button
                                    class="w-full py-4 px-6 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-pixel font-bold rounded-xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-pink-400/30 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                    onclick={handlePasskeyLogin}
                                    disabled={loggingIn || creating}
                                >
                                    {#if loggingIn}
                                        <Loader
                                            classNames="w-5 h-5"
                                            textColor="text-white"
                                        />
                                        <span>Signing In...</span>
                                    {:else}
                                        <svg
                                            class="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path
                                                d="M7 14C5.9 14 5 13.1 5 12S5.9 10 7 10 9 10.9 9 12 8.1 14 7 14M12.6 10C11.8 7.7 9.6 6 7 6C3.7 6 1 8.7 1 12S3.7 18 7 18C9.6 18 11.8 16.3 12.6 14H16V18H20V14H23V10H12.6Z"
                                            />
                                        </svg>
                                        <span>Passkey Login</span>
                                    {/if}
                                </button>
                            {:else}
                                <!-- SignUp Form -->
                                <div
                                    class="bg-black/40 rounded-xl p-4 space-y-3 border border-lime-400/30"
                                >
                                    <input
                                        type="text"
                                        bind:value={username}
                                        placeholder="Choose Username"
                                        class="w-full bg-black/60 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-lime-400 transition-colors font-pixel text-sm"
                                    />

                                    <div class="flex justify-center">
                                        <Turnstile
                                            siteKey={import.meta.env
                                                .PUBLIC_TURNSTILE_SITE_KEY}
                                            on:callback={(e) => {
                                                turnstileToken = e.detail.token;
                                            }}
                                            on:expired={() => {
                                                turnstileToken = "";
                                            }}
                                            theme="dark"
                                        />
                                    </div>

                                    <div class="flex gap-2">
                                        <button
                                            class="flex-1 py-2 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800 transition-colors font-pixel text-xs"
                                            onclick={() =>
                                                (showSignupForm = false)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            class="flex-1 py-2 rounded-lg bg-lime-400 text-slate-900 font-bold hover:bg-lime-300 transition-colors font-pixel text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={!username ||
                                                !turnstileToken ||
                                                creating}
                                            onclick={handleSignUpSubmit}
                                        >
                                            {#if creating}
                                                Creating...
                                            {:else}
                                                Start!
                                            {/if}
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <!-- Migration Warning -->
                        <div
                            class="mt-6 bg-amber-900/40 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2 text-amber-200 text-[10px] font-pixel"
                        >
                            <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z" />
                            </svg>
                            <span>We're upgrading passkeys.<br/>Browse free, or use <a href="https://smol.xyz" class="underline hover:text-amber-100" target="_blank" rel="noopener">smol.xyz</a> to create.</span>
                        </div>

                        <!-- Bottom info -->
                        <p
                            class="text-center text-gray-500 text-xs mt-4 font-pixel"
                        >
                            🔐 Your Keys. Your Music.
                        </p>
                    </div>
                </div>

                <!-- Bottom decorative element -->
                <div class="flex justify-center mt-6">
                    <div
                        class="flex items-center gap-2 text-lime-400/60 text-xs font-pixel"
                    >
                        <div
                            class="w-8 h-px bg-gradient-to-r from-transparent to-lime-400/40"
                        ></div>
                        <span>Powered by SMOL</span>
                        <div
                            class="w-8 h-px bg-gradient-to-l from-transparent to-lime-400/40"
                        ></div>
                    </div>
                </div>

                <!-- Theme Dropdown (Bottom Right) -->
                <div
                    class="absolute -bottom-12 right-0 z-50 pointer-events-auto"
                >
                    <div class="relative inline-block text-left">
                        <button
                            onclick={() => (showThemeMenu = !showThemeMenu)}
                            class="flex items-center gap-2 px-3 py-1.5 bg-black/60 border border-lime-400/30 rounded-lg text-lime-400 font-pixel text-xs hover:bg-lime-400/10 transition-colors"
                        >
                            <span>Theme: {bgOptions[currentBgIndex].name}</span>
                            <svg
                                class="w-3 h-3"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                ><path d="M7 10l5 5 5-5z" /></svg
                            >
                        </button>

                        {#if showThemeMenu}
                            <div
                                class="absolute right-0 bottom-full mb-2 w-56 rounded-xl border border-lime-400/30 bg-black/90 backdrop-blur-xl shadow-xl overflow-hidden"
                            >
                                <div class="py-1">
                                    {#each bgOptions as bg, i}
                                        <button
                                            class="w-full text-left px-4 py-2 text-xs font-pixel hover:bg-lime-400/20 transition-colors flex items-center gap-2 relative group {currentBgIndex ===
                                            i
                                                ? 'text-lime-400'
                                                : 'text-gray-300'}"
                                            onclick={() => {
                                                currentBgIndex = i;
                                                showThemeMenu = false;
                                            }}
                                        >
                                            <span class="mr-auto"
                                                >{bg.name}</span
                                            >
                                            {#if bg.special}
                                                <div
                                                    class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-gradient-to-b from-blue-600 to-blue-900 border-2 border-gray-200 rounded shadow-lg animate-bounce duration-[2000ms]"
                                                >
                                                    <span
                                                        class="text-[8px] text-white leading-none tracking-widest drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
                                                        >FEB 14</span
                                                    >
                                                </div>
                                            {/if}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <!-- 
          Reuse valid HOME logic for upstream parity.
          This ensures we see exactly what the main repo would see for a logged in user 
          (SmolGrid with endpoint="created"), but wrapped in our splash logic.
      -->
        <Home endpoint="created" />
    {/if}
</div>
