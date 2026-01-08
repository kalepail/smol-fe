<script lang="ts">
    import KaleEmoji from "../components/ui/KaleEmoji.svelte";
</script>

<div
    class="min-h-[100dvh] w-full bg-slate-950 flex flex-col items-center justify-center p-4 pt-24 md:pt-4 overflow-hidden relative font-pixel"
>
    <!-- Background Image Layer -->
    <div class="absolute inset-0 z-0 overflow-hidden">
        <img
            src="/images/kale-planet.png"
            alt="Planet Demeter"
            class="w-full h-full object-cover scale-110 translate-y-10 opacity-30 hover:scale-115 transition-transform duration-[30s]"
        />
        <div
            class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-slate-950/80"
        ></div>

        <!-- Rotating Star Containers -->
        <div
            class="absolute inset-0 pointer-events-none z-0 overflow-hidden flex items-center justify-center"
        >
            <!-- Slow Orbit 1 -->
            <div
                class="absolute w-[150vmax] h-[150vmax] animate-orbit-slow flex items-center justify-center"
            >
                {#each Array(40) as _, i}
                    <div
                        class="absolute w-0.5 h-0.5 md:w-1 md:h-1 bg-white rounded-full animate-pulse"
                        style="top: {Math.random() *
                            100}%; left: {Math.random() *
                            100}%; animation-delay: {Math.random() *
                            5}s; opacity: {Math.random() * 0.5 + 0.3};"
                    ></div>
                {/each}
            </div>

            <!-- Slow Orbit 2 (Reverse + Lime) -->
            <div
                class="absolute w-[150vmax] h-[150vmax] animate-orbit-reverse flex items-center justify-center"
            >
                {#each Array(15) as _, i}
                    <div
                        class="absolute w-1 h-1 md:w-1.5 md:h-1.5 bg-lime-400 rounded-full animate-pulse blur-[1px]"
                        style="top: {Math.random() *
                            100}%; left: {Math.random() *
                            100}%; animation-delay: {Math.random() *
                            7}s; opacity: {Math.random() * 0.4};"
                    ></div>
                {/each}
            </div>
        </div>

        <!-- Rare Shooting Star -->
        <div class="shooting-star"></div>
    </div>

    <style>
        @keyframes orbit-slow {
            from {
                transform: rotate(0deg);
            }
            to {
                transform: rotate(360deg);
            }
        }
        @keyframes orbit-reverse {
            from {
                transform: rotate(360deg);
            }
            to {
                transform: rotate(0deg);
            }
        }
        .animate-orbit-slow {
            animation: orbit-slow 120s linear infinite;
        }
        .animate-orbit-reverse {
            animation: orbit-reverse 180s linear infinite;
        }
        .shooting-star {
            position: absolute;
            bottom: -10%;
            left: -10%;
            width: 2px;
            height: 2px;
            background: white;
            box-shadow:
                0 0 4px white,
                0 0 10px white;
            animation: shoot 12s linear infinite;
            opacity: 0;
            z-index: 1;
        }

        @keyframes shoot {
            0% {
                transform: translate(0, 0) rotate(-45deg) scaleX(1);
                opacity: 0;
            }
            5% {
                opacity: 1;
            }
            25% {
                transform: translate(100vw, -100vh) rotate(-45deg) scaleX(15);
                opacity: 1;
                box-shadow:
                    0 0 4px white,
                    0 0 10px white;
            }
            27% {
                transform: translate(110vw, -110vh) rotate(-45deg) scale(6)
                    scaleX(1);
                opacity: 1;
                box-shadow:
                    0 0 40px white,
                    0 0 80px white,
                    0 0 120px #ccff00;
                background: #ccff00;
            }
            30% {
                transform: translate(120vw, -120vh) rotate(-45deg) scaleX(20);
                opacity: 0;
            }
            100% {
                opacity: 0;
            }
        }
    </style>

    <!-- Content Card -->
    <div class="max-w-4xl w-full relative z-10">
        <!-- Header -->
        <div class="text-center mb-6">
            <div
                class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-lime-500/10 border border-lime-500/30 mb-3"
            >
                <KaleEmoji size="w-10 h-10" />
            </div>
            <h1 class="text-2xl md:text-3xl font-pixel text-lime-400 mb-1">
                The Story of KALE
            </h1>
            <p class="text-slate-500 text-xs font-pixel lowercase">
                a collaborative proof of teamwork asset on Stellar
            </p>
        </div>

        <!-- Main Grid -->
        <div class="grid md:grid-cols-3 gap-3 mb-6">
            <!-- Story Card -->
            <div
                class="bg-gradient-to-br from-lime-950/40 via-black/60 to-emerald-950/40 rounded-xl border border-lime-500/20 p-4 font-pixel"
            >
                <h2
                    class="text-sm font-pixel text-lime-400 mb-2 flex items-center gap-2"
                >
                    🪐 The Lore
                </h2>
                <p
                    class="text-slate-400 text-[10px] leading-relaxed tracking-wide"
                >
                    On a distant planet called <span
                        class="text-lime-300 text-[11px]">Demeter</span
                    >, scientists discovered
                    <span class="text-lime-300 text-[11px]">Kale-Corium</span> -
                    a crystalline vegetable that could end universal hunger. To protect
                    it from the villain Zebulon, they distributed farming across
                    the cosmos.
                </p>
            </div>

            <!-- How it Works Card -->
            <div
                class="bg-black/40 rounded-xl border border-slate-700/50 p-4 font-pixel"
            >
                <h2 class="text-sm text-lime-400 mb-2 flex items-center gap-2">
                    🌱 How It Works
                </h2>
                <div class="space-y-1.5 text-[10px] tracking-wide">
                    <div class="flex gap-2">
                        <span class="text-lime-400">1.</span><span
                            class="text-slate-400"
                            ><span class="text-lime-300">Plant</span> - Stake tokens
                            to claim a plot</span
                        >
                    </div>
                    <div class="flex gap-2">
                        <span class="text-lime-400">2.</span><span
                            class="text-slate-400"
                            ><span class="text-lime-300">Work</span> - Mine hashes
                            to tend crops</span
                        >
                    </div>
                    <div class="flex gap-2">
                        <span class="text-lime-400">3.</span><span
                            class="text-slate-400"
                            ><span class="text-lime-300">Harvest</span> - Collect
                            2,500 KALE/block</span
                        >
                    </div>
                </div>
            </div>

            <!-- SMOL Integration Card -->
            <div
                class="bg-gradient-to-r from-purple-950/30 to-lime-950/30 rounded-xl border border-purple-500/20 p-4 font-pixel"
            >
                <h2
                    class="text-sm font-pixel text-purple-400 mb-2 flex items-center gap-2"
                >
                    🎵 KALE × SMOL
                </h2>
                <div
                    class="grid grid-cols-2 gap-2 text-center mb-2 tracking-wide"
                >
                    <div class="bg-black/40 rounded-lg p-2">
                        <div class="text-sm font-bold text-lime-400">
                            100 <KaleEmoji size="w-3 h-3" />
                        </div>
                        <div class="text-[8px] text-slate-500 uppercase">
                            to mint
                        </div>
                    </div>
                    <div class="bg-black/40 rounded-lg p-2">
                        <div class="text-sm font-bold text-lime-400">
                            ~33 <KaleEmoji size="w-3 h-3" />
                        </div>
                        <div class="text-[8px] text-slate-500 uppercase">
                            to buy
                        </div>
                    </div>
                </div>
                <!-- Tip Artists -->
                <div
                    class="bg-black/40 rounded-lg p-2 text-center mb-1 tracking-wider"
                >
                    <div class="text-[9px] text-slate-300 lowercase">
                        💚 Tip Artists
                    </div>
                    <div class="text-[7px] text-slate-500 mt-0.5">
                        100% goes to them
                    </div>
                </div>
                <!-- Support Mixtapes -->
                <div
                    class="bg-black/40 rounded-lg p-2 text-center tracking-wider"
                >
                    <div class="text-[9px] text-slate-300 lowercase">
                        🎧 Support Mixtapes
                    </div>
                    <div class="text-[7px] text-slate-500 mt-0.5">
                        artists 50% • curators 30% • minters 20%
                    </div>
                </div>
            </div>
        </div>

        <!-- Links Row -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <a
                href="https://stellar.org/blog/ecosystem/the-story-of-kale"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 p-3 bg-black/40 rounded-lg border border-slate-700/50 hover:border-lime-500/30 transition-all group"
            >
                <div class="w-6 h-6 flex items-center justify-center text-sm">
                    ⭐
                </div>
                <div class="flex-1 min-w-0">
                    <div
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate font-pixel lowercase"
                    >
                        Stellar Article
                    </div>
                </div>
            </a>

            <a
                href="https://kalefarm.xyz"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 p-3 bg-black/40 rounded-lg border border-slate-700/50 hover:border-lime-500/30 transition-all group"
            >
                <KaleEmoji size="w-6 h-6" />
                <div class="flex-1 min-w-0">
                    <div
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate font-pixel lowercase"
                    >
                        Kale Farm
                    </div>
                </div>
            </a>

            <a
                href="https://lobstr.co"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 p-3 bg-black/40 rounded-lg border border-slate-700/50 hover:border-lime-500/30 transition-all group"
            >
                <div class="w-6 h-6 flex items-center justify-center text-sm">
                    📱
                </div>
                <div class="flex-1 min-w-0">
                    <div
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate font-pixel lowercase"
                    >
                        Lobstr Wallet
                    </div>
                </div>
            </a>

            <a
                href="https://stellarx.com/markets/KALE:GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE/native"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 p-3 bg-black/40 rounded-lg border border-slate-700/50 hover:border-lime-500/30 transition-all group"
            >
                <div class="w-6 h-6 flex items-center justify-center text-sm">
                    📈
                </div>
                <div class="flex-1 min-w-0">
                    <div
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate lowercase"
                    >
                        StellarX
                    </div>
                </div>
            </a>

            <a
                href="https://kalepail.com/kale"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 p-3 bg-black/40 rounded-lg border border-slate-700/50 hover:border-lime-500/30 transition-all group col-span-2 md:col-span-1"
            >
                <div class="w-6 h-6 flex items-center justify-center text-sm">
                    📖
                </div>
                <div class="flex-1 min-w-0">
                    <div
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate font-pixel lowercase"
                    >
                        Full Lore
                    </div>
                </div>
            </a>
        </div>

        <!-- Footer -->
        <p
            class="text-center text-slate-600 text-[10px] italic tracking-widest font-pixel"
        >
            "In the fields of Demeter, every farmer matters." 🥬
        </p>
    </div>
</div>
