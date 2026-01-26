<script lang="ts">
    console.log("[PasskeySplash] Component loading - script executing");

    import { onMount } from "svelte";
    import { fade, fly, scale } from "svelte/transition";
    import { useAuthentication } from "../../hooks/useAuthentication";
    import { userState } from "../../stores/user.svelte.ts";
    import { setBackgroundAnimations } from "../../stores/background.svelte.ts";
    import Loader from "../ui/Loader.svelte";
    import { Turnstile } from "svelte-turnstile";
    import logger, { LogCategory } from "../../utils/debug-logger";
    import {
        safeLocalStorageGet,
        safeLocalStorageSet,
    } from "../../utils/storage";

    console.log("[PasskeySplash] All imports loaded");

    // State
    let step = $state<"intro" | "username" | "processing" | "success">("intro");
    let username = $state("");
    let error = $state<string | null>(null);
    let turnstileToken = $state("");
    let shouldRedirect = $state(false);

    // Early authentication check to prevent flash
    // Check immediately if user is already authenticated
    const checkAuth = () => {
        if (typeof window === "undefined") return false;
        const skipped = safeLocalStorageGet("smol_passkey_skipped");
        const hasContractId = Boolean(userState.contractId);

        if (hasContractId || (skipped && step !== "success")) {
            return hasContractId;
        }
        return false;
    };

    // Perform check synchronously on component initialization
    // But ALLOW override if ?debug is present to let devs/triage stay on the page
    const hasDebug =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("debug");
    shouldRedirect = checkAuth() && !hasDebug;

    // Check for Direct Relayer Mode (Dev/Preview)
    // Direct Relayer (OZ Channels) should ONLY be used on dev/preview environments to bypass Turnstile.
    // Production (smol.xyz) must ALWAYS use KaleFarm Turnstile Proxy.
    const isPagesDev =
        typeof window !== "undefined" &&
        window.location.hostname.includes("pages.dev");
    const isLocalhost =
        typeof window !== "undefined" &&
        window.location.hostname.includes("localhost");
    const hasApiKey = !!import.meta.env.PUBLIC_RELAYER_API_KEY;

    const isDirectRelayer = (isPagesDev || isLocalhost) && hasApiKey;

    if (typeof window !== "undefined") {
        console.log(
            "[Debug] Relayer Config:",
            JSON.stringify({
                isDirectRelayer,
                isPagesDev,
                isLocalhost,
                hasKey: hasApiKey,
                mode: import.meta.env.MODE,
                baseUrl: import.meta.env.BASE_URL,
            }),
        );
    }

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
        let i = 0;
        const target = TAGLINES[taglineIndex];
        visibleCount = 0;

        const typeInterval = setInterval(() => {
            i++;
            visibleCount = i;
            if (i >= target.length) {
                clearInterval(typeInterval);
            }
        }, 50);

        const nextInterval = setTimeout(() => {
            taglineIndex = (taglineIndex + 1) % TAGLINES.length;
        }, 4000);

        // Rotate placeholders every 2.5s
        const placeholderInterval = setInterval(() => {
            placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length;
        }, 2500);

        return () => {
            clearInterval(typeInterval);
            clearTimeout(nextInterval);
            clearInterval(placeholderInterval);
        };
    });

    onMount(() => {
        // Enable high-performance background mode
        setBackgroundAnimations(true);

        // Perform redirect if shouldRedirect was set during initialization
        if (shouldRedirect) {
            window.location.href = "/";
            return;
        }

        // Analytics
        logEvent("passkey_splash_view", {
            variant: "arcade",
            is_new_user: !safeLocalStorageGet("smol_passkey_skipped"),
            platform: getPlatform(),
        });

        return () => {
            setBackgroundAnimations(false);
        };
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

    // 2026+ Feature: Client-Side Capability Detection
    let isPlatformAuthenticatorAvailable = $state(false);

    onMount(async () => {
        // ... (existing onMount logic) ...

        // Check for Biometrics/Secure Enclave
        if (
            window.PublicKeyCredential &&
            PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
        ) {
            isPlatformAuthenticatorAvailable =
                await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        }

        // Prefetch Dashboard for "Instant" feel
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = "/";
        document.head.appendChild(link);
    });

    function logEvent(name: string, payload: any = {}) {
        // In a real app, send to analytics backend
        console.log(`[Analytics] ${name}`, payload);
    }

    async function handleSmartLogin() {
        // Try login first (existing passkey)
        logEvent("passkey_smart_login_start");
        step = "processing";
        error = null;

        try {
            await authHook.login();
            logEvent("passkey_login_success");
            step = "success";
            if (navigator.vibrate) navigator.vibrate(200);
            setTimeout(() => {
                window.location.href = "/";
            }, 500);
        } catch (e: any) {
            // Login failed/cancelled
            console.log("Login failed or cancelled:", e.message);

            // ALWAYS return to intro on failure/cancellation
            // Do not assume they want to sign up; they can click 'Create Account' for that.
            step = "intro";

            // Optional: Show error if it wasn't a cancellation
            // ERROR HANDLING: Show real feedback
            const message = e.message?.toLowerCase() || "";

            // Check for specific error cases
            const isNoCredentials =
                message.includes("failed to connect wallet") ||
                message.includes("no credentials available") ||
                (message.includes("credential") &&
                    message.includes("not found"));

            // Filter out standard cancellations (user closed popup or timed out)
            if (
                !message.includes("abort") &&
                !message.includes("cancel") &&
                !message.includes("interaction was not allowed") &&
                !message.includes("timed out or was not allowed")
            ) {
                // Provide more helpful error message for no credentials case
                if (isNoCredentials) {
                    error =
                        "No passkey found. Please create a new account instead.";
                    logger.debug(
                        LogCategory.PASSKEY,
                        "No passkey credentials found for login",
                    );
                } else {
                    logger.error(
                        LogCategory.PASSKEY,
                        "Passkey Login Critical Error",
                        undefined,
                        e,
                    );
                    console.error("Passkey Login Critical Error:", e);
                    error = `Login failed: ${e.message || "Unknown error"}`;
                }

                // Auto-clear error after 5s to reset UI state
                setTimeout(() => {
                    error = null;
                }, 5000);
            } else {
                logger.debug(
                    LogCategory.PASSKEY,
                    "User cancelled login or timed out",
                );
            }
        }
    }

    async function submitUsername() {
        if (!username.trim()) return;
        step = "processing";
        error = null;

        try {
            await authHook.signUp(username, turnstileToken);
            logEvent("passkey_create_success");
            step = "success";
            if (navigator.vibrate) navigator.vibrate(200);
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

    function handleSkip() {
        logEvent("passkey_skip_click");
        safeLocalStorageSet("smol_passkey_skipped", "true");
        safeLocalStorageSet("smol_onboarding_complete", "true"); // Mark onboarding as done
        window.location.href = "/";
    }

    function handleKeydown(e: KeyboardEvent) {
        if (step === "intro") {
            if (e.key === "Enter" || e.key === " ") {
                handleSmartLogin();
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

{#if !shouldRedirect}
    <div
        class="fixed inset-0 bg-transparent text-white overflow-y-auto font-pixel z-[100]"
    >
        <!-- Background Art (Handled globally by Layout/DynamicBackground) -->

        <!-- CRT Scanline Effect -->
        <div
            class="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] contrast-[100%] brightness-100 opacity-20"
        ></div>

        <!-- Decorative Game Cabinet Frame (Subtle Vignette) -->
        <div
            class="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.8)_100%)] z-20"
        ></div>

        <main
            class="relative z-30 min-h-screen flex flex-col items-center justify-center p-6 safe-area-inset-bottom"
        >
            <!-- HEADER -->
            <div
                class="mb-6 md:mb-8 text-center shrink-0"
                in:fade={{ duration: 800 }}
            >
                <!-- DEBUG: Relayer Mode Indicator -->
                <div
                    class="fixed bottom-0 right-0 p-2 text-[10px] bg-black/80 backdrop-blur border-t border-l border-lime-400/20 text-lime-400 font-mono z-[50] text-right pointer-events-none"
                >
                    <div>
                        MODE: {isDirectRelayer
                            ? "DIRECT (BYPASS)"
                            : "PROXY (TURNSTILE)"}
                    </div>
                    <div>
                        HOST: {typeof window !== "undefined"
                            ? window.location.hostname
                            : "SERVER"}
                    </div>
                    <div>KEY: {hasApiKey ? "PRESENT" : "MISSING"}</div>
                    <div>
                        IS_DEV: {isPagesDev || isLocalhost ? "YES" : "NO"}
                    </div>
                    <div>
                        CFG_URL: {import.meta.env.PUBLIC_RELAYER_URL || "N/A"}
                    </div>
                    <div>
                        TARGET: {isDirectRelayer
                            ? "channels.openzeppelin.com"
                            : "api.kalefarm.xyz"}
                    </div>
                </div>
                <!-- Rotating One-Liner -->
                <!-- Shift right slightly to align center with the '.' in SMOL.XYZ -->
                <div
                    class="min-h-[24px] md:min-h-[32px] flex items-center justify-center mb-2 md:mb-6 pl-[0.6ch]"
                >
                    <p
                        class="text-lime-400 font-pixel uppercase tracking-widest text-xs md:text-sm drop-shadow-[0_0_10px_rgba(132,204,22,0.5)] whitespace-pre-wrap text-center leading-tight"
                    >
                        {#each TAGLINES[taglineIndex].split("") as char, i}
                            <span
                                class="transition-opacity duration-0 {i <
                                visibleCount
                                    ? 'opacity-100'
                                    : 'opacity-0'}">{char}</span
                            >
                        {/each}
                        <!-- Zero-width cursor container to prevent centering offset -->
                        <span class="inline-block w-0 overflow-visible"
                            ><span class="animate-pulse">_</span></span
                        >
                    </p>
                </div>

                <h1
                    class="text-3xl md:text-5xl font-pixel font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-b from-lime-400 to-lime-600 drop-shadow-[0_4px_0_rgba(132,204,22,0.2)]"
                >
                    SMOL.XYZ
                </h1>
            </div>

            <!-- CONTENT CONTAINER -->
            <div
                class="w-full max-w-md relative min-h-[200px] md:min-h-[300px] flex flex-col items-center justify-center"
            >
                {#if step === "intro"}
                    <div
                        class="w-full flex flex-col items-center gap-3 md:gap-6"
                        in:fade={{ duration: 300 }}
                    >
                        <!-- PRIMARY CTA: LOGIN & CREATE -->
                        <div class="flex flex-col w-full gap-3">
                            <button
                                onclick={handleSmartLogin}
                                class="group relative w-full py-4 px-6 bg-[#1d293d] text-lime-400 font-pixel font-bold uppercase tracking-widest text-sm rounded-lg
                               hover:bg-[#2a3b55] hover:-translate-y-1 hover:shadow-[0_8px_0_rgba(15,23,42,1)]
                               active:translate-y-1 active:shadow-none active:bg-[#151e2e]
                               transition-all duration-100 shadow-[0_4px_0_rgba(15,23,42,1)]
                               focus:outline-none focus:ring-4 focus:ring-lime-400/20 border-2 border-lime-400/20"
                                aria-label="Passkey Login"
                            >
                                <span
                                    class="relative z-10 flex items-center justify-center gap-3"
                                >
                                    <img
                                        src="https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f96c.png"
                                        alt="Kale"
                                        class="w-5 h-5 object-contain"
                                    /> LOGIN WITH PASSKEY
                                </span>
                            </button>

                            <button
                                onclick={() => {
                                    step = "username";
                                    logEvent("passkey_create_start");
                                }}
                                class="group relative w-full py-4 px-6 bg-lime-500 text-black font-pixel font-bold uppercase tracking-widest text-sm rounded-lg
                               hover:bg-lime-400 hover:-translate-y-1 hover:shadow-[0_8px_0_rgba(65,130,22,0.6)]
                               active:translate-y-1 active:shadow-none active:bg-lime-600
                               transition-all duration-100 shadow-[0_4px_0_rgba(65,130,22,0.6)]
                               focus:outline-none focus:ring-4 focus:ring-lime-400/50"
                                aria-label="Create Account"
                            >
                                <span
                                    class="relative z-10 flex items-center justify-center gap-3"
                                >
                                    📝 CREATE NEW ACCOUNT
                                </span>
                            </button>
                        </div>

                        <!-- INFO TEXT -->
                        <div class="mt-4 text-center space-y-1">
                            {#if isPlatformAuthenticatorAvailable}
                                <div
                                    class="inline-flex items-center gap-1.5 px-2 py-1 bg-lime-400/10 rounded-full border border-lime-400/20 text-[10px] text-lime-400 font-pixel uppercase tracking-wider animate-pulse"
                                >
                                    <span
                                        class="w-1.5 h-1.5 rounded-full bg-lime-400"
                                    ></span>
                                    Secure Enclave Detected
                                </div>
                            {:else}
                                <p
                                    class="text-[10px] md:text-xs text-white/60 font-pixel"
                                >
                                    SECURED BY YOUR DEVICE.
                                </p>
                            {/if}
                        </div>

                        <!-- ESCAPE HATCH -->
                        <button
                            onclick={handleSkip}
                            class="mt-4 text-lime-400 hover:text-lime-300 font-pixel uppercase text-[10px] tracking-widest
                           focus:outline-none focus:text-lime-300"
                        >
                            Enter as Guest
                        </button>

                        <!-- Migration Warning -->
                        <div
                            class="mt-6 max-w-sm bg-amber-900/40 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2 text-amber-200 text-[10px] font-pixel"
                        >
                            <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z" />
                            </svg>
                            <span>We're upgrading passkeys.<br/>Browse free, or use <a href="https://smol.xyz" class="underline hover:text-amber-100" target="_blank" rel="noopener">smol.xyz</a> to create.</span>
                        </div>
                    </div>
                {:else if step === "username"}
                    <div
                        class="w-full max-w-lg flex flex-col gap-4 items-center"
                        in:scale={{ duration: 300, start: 0.95 }}
                    >
                        <div
                            class="text-lime-400 font-pixel uppercase tracking-widest text-sm mb-1"
                        >
                            All Access Pass
                        </div>
                        <div
                            class="text-white/60 font-pixel text-[10px] text-center mb-4 leading-relaxed"
                        >
                            Secure your connection to the culture.<br />
                            A private handle for the AI music economy.
                        </div>

                        <input
                            type="text"
                            bind:value={username}
                            placeholder={PLACEHOLDERS[placeholderIndex]}
                            class="w-full bg-white/5 border-2 border-white/20 rounded-lg py-3 px-4 text-center font-pixel text-white uppercase tracking-widest placeholder:text-white/20 text-xs
                            focus:border-lime-400 focus:outline-none focus:bg-white/10 focus:shadow-[0_0_20px_rgba(163,230,53,0.3)] caret-lime-400 transition-all"
                            autofocus
                            autocomplete="username webauthn"
                            onkeydown={(e) => e.stopPropagation()}
                        />

                        {#if error}
                            <p
                                class="text-rose-400 text-xs font-mono text-center bg-rose-500/10 p-2 rounded w-full"
                            >
                                {error}
                            </p>
                        {/if}

                        <!-- Turnstile moved above buttons for better visibility -->
                        {#if !isDirectRelayer}
                            <div
                                class="flex justify-center my-2 scale-90 origin-center min-h-[65px]"
                            >
                                <Turnstile
                                    siteKey={import.meta.env
                                        .PUBLIC_TURNSTILE_SITE_KEY}
                                    on:callback={(e) => {
                                        turnstileToken = e.detail.token;
                                        error = null;
                                    }}
                                    on:expired={() => {
                                        turnstileToken = "";
                                    }}
                                    on:error={(e) => {
                                        console.error("Turnstile Error:", e);
                                        // Check for common "Domain Not Allowed" error (110200)
                                        // Note: e.detail may contain the code, or we infer from context
                                        if (
                                            window.location.hostname.includes(
                                                "pages.dev",
                                            ) ||
                                            window.location.hostname.includes(
                                                "localhost",
                                            )
                                        ) {
                                            error =
                                                "Turnstile Error: Domain not authorized. Add to Cloudflare whitelist.";
                                        } else {
                                            error =
                                                "Verification failed. Please refresh.";
                                        }
                                    }}
                                    theme="dark"
                                    appearance="interaction-only"
                                />
                            </div>
                        {/if}

                        <div class="flex w-full gap-3 mt-2">
                            <button
                                onclick={() => (step = "intro")}
                                class="flex-1 py-3 border-2 border-white/10 text-white/60 font-pixel uppercase text-xs rounded-lg hover:bg-white/5 hover:text-white transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onclick={() => {
                                    if (!username.trim()) {
                                        error = "Please enter a username.";
                                        return;
                                    }
                                    if (!turnstileToken && !isDirectRelayer) {
                                        error =
                                            "Please complete the verification check above.";
                                        return;
                                    }
                                    submitUsername();
                                }}
                                class="flex-[2] py-3 bg-lime-500 text-black font-pixel font-bold uppercase text-xs rounded-lg shadow-[0_4px_0_rgba(65,130,22,0.6)]
                                hover:bg-lime-400 active:translate-y-1 active:shadow-none transition-all
                                {!username.trim() ||
                                (!turnstileToken && !isDirectRelayer)
                                    ? 'opacity-80 cursor-not-allowed'
                                    : ''}"
                            >
                                Start Game
                            </button>
                        </div>

                        <div
                            class="mt-4 text-[10px] text-lime-400 font-pixel uppercase tracking-widest opacity-80 text-center"
                        >
                            🔒 Your Keys. Your Music. 🔑
                        </div>
                    </div>
                {:else if step === "processing"}
                    <div class="flex flex-col items-center gap-4" in:fade>
                        <Loader classNames="w-12 h-12" textColor="text-white" />
                        <p
                            class="text-white font-pixel animate-pulse text-xs uppercase tracking-widest"
                        >
                            Authorizing...
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
{/if}

<style>
    /* Safely handle specific safe areas */
    .safe-area-inset-bottom {
        padding-bottom: env(safe-area-inset-bottom, 24px);
    }
</style>
