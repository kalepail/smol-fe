<script lang="ts">
    import KaleEmoji from "../components/ui/KaleEmoji.svelte";
</script>

<div
    class="min-h-screen bg-gradient-to-b from-slate-950 via-emerald-950/20 to-slate-950"
>
    <!-- Hero Section -->
    <div class="relative overflow-hidden">
        <!-- Floating Kale Background -->
        <div class="absolute inset-0 opacity-5 pointer-events-none">
            <div class="absolute top-10 left-10 text-8xl animate-pulse">🥬</div>
            <div
                class="absolute top-40 right-20 text-6xl animate-pulse"
                style="animation-delay: 1s;"
            >
                🥬
            </div>
            <div
                class="absolute bottom-20 left-1/4 text-7xl animate-pulse"
                style="animation-delay: 2s;"
            >
                🥬
            </div>
            <div
                class="absolute top-1/2 right-1/3 text-5xl animate-pulse"
                style="animation-delay: 0.5s;"
            >
                🥬
            </div>
        </div>

        <div class="max-w-3xl mx-auto px-6 py-16 relative z-10">
            <!-- Header -->
            <div class="text-center mb-12">
                <div
                    class="inline-flex items-center justify-center w-24 h-24 rounded-full bg-lime-500/10 border border-lime-500/30 mb-6"
                >
                    <KaleEmoji size="w-16 h-16" />
                </div>
                <h1 class="text-4xl md:text-5xl font-pixel text-lime-400 mb-4">
                    The Story of KALE
                </h1>
                <p class="text-slate-400 text-lg font-pixel">
                    a collaborative farming token on the Stellar blockchain
                </p>
            </div>

            <!-- Story Section -->
            <div class="prose prose-invert prose-lime max-w-none space-y-8">
                <!-- Opening -->
                <div
                    class="bg-gradient-to-br from-lime-950/40 via-black/60 to-emerald-950/40 rounded-2xl border border-lime-500/20 p-6 md:p-8"
                >
                    <p
                        class="text-slate-300 leading-relaxed text-sm md:text-base mb-4"
                    >
                        <span class="text-2xl">🪐</span>
                        <em
                            >Long ago, on a distant planet called <span
                                class="text-lime-400 font-bold">Demeter</span
                            >...</em
                        >
                    </p>
                    <p class="text-slate-400 leading-relaxed text-sm">
                        Scientists discovered a peculiar crystalline vegetable - <span
                            class="text-lime-300">Kale-Corium</span
                        > - that held the key to ending universal hunger. But the
                        villain Zebulon coveted its power, seeking to control the
                        galaxy's food supply.
                    </p>
                    <p class="text-slate-400 leading-relaxed text-sm mt-4">
                        The people of Demeter devised a plan: distribute the
                        farming of Kale across the cosmos, making it impossible
                        for any single entity to control. And so, <span
                            class="text-lime-300 font-bold">KALE</span
                        > was born — a token representing collaborative effort, shared
                        rewards, and the spirit of community.
                    </p>
                </div>

                <!-- How it Works -->
                <div
                    class="bg-black/40 rounded-2xl border border-slate-700/50 p-6 md:p-8"
                >
                    <h2
                        class="text-xl font-pixel text-lime-400 mb-6 flex items-center gap-3"
                    >
                        <span>🌱</span> How KALE Works
                    </h2>
                    <div class="space-y-4 text-sm">
                        <div class="flex gap-4 items-start">
                            <span class="text-2xl">1️⃣</span>
                            <div>
                                <h3 class="text-lime-300 font-bold mb-1">
                                    Plant
                                </h3>
                                <p class="text-slate-400">
                                    Stake your KALE tokens to claim a plot in
                                    the cosmic garden. Your stake grows over
                                    time.
                                </p>
                            </div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <span class="text-2xl">2️⃣</span>
                            <div>
                                <h3 class="text-lime-300 font-bold mb-1">
                                    Work
                                </h3>
                                <p class="text-slate-400">
                                    Mine block hashes to tend your crops. Every
                                    valid hash brings you closer to harvest.
                                </p>
                            </div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <span class="text-2xl">3️⃣</span>
                            <div>
                                <h3 class="text-lime-300 font-bold mb-1">
                                    Harvest
                                </h3>
                                <p class="text-slate-400">
                                    Collect your rewards! 2,500 KALE distributed
                                    per block, shared among all farmers.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SMOL Integration -->
                <div
                    class="bg-gradient-to-r from-purple-950/30 to-lime-950/30 rounded-2xl border border-purple-500/20 p-6 md:p-8"
                >
                    <h2
                        class="text-xl font-pixel text-purple-400 mb-4 flex items-center gap-3"
                    >
                        <span>🎵</span> KALE × SMOL
                    </h2>
                    <p class="text-slate-400 leading-relaxed text-sm mb-4">
                        On SMOL, KALE powers the music ecosystem. It's how
                        artists mint their songs, how listeners collect tracks,
                        and how curators support mixtapes.
                    </p>
                    <div class="grid grid-cols-2 gap-4 text-center">
                        <div class="bg-black/40 rounded-xl p-4">
                            <div class="text-2xl font-bold text-lime-400 mb-1">
                                100 <KaleEmoji size="w-4 h-4" />
                            </div>
                            <div class="text-xs text-slate-500">
                                to mint a song
                            </div>
                        </div>
                        <div class="bg-black/40 rounded-xl p-4">
                            <div class="text-2xl font-bold text-lime-400 mb-1">
                                ~33 <KaleEmoji size="w-4 h-4" />
                            </div>
                            <div class="text-xs text-slate-500">
                                to buy a token
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Links Section -->
                <div class="space-y-3">
                    <h2
                        class="text-xl font-pixel text-lime-400 mb-4 flex items-center gap-3"
                    >
                        <span>🔗</span> Explore KALE
                    </h2>

                    <a
                        href="https://stellar.org/blog/ecosystem/the-story-of-kale"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-4 p-4 bg-black/40 rounded-xl border border-slate-700/50 hover:border-lime-500/30 hover:bg-lime-500/5 transition-all group"
                    >
                        <img
                            src="https://stellar.org/favicon.ico"
                            alt="Stellar"
                            class="w-10 h-10"
                        />
                        <div class="flex-1">
                            <div
                                class="text-slate-200 font-bold group-hover:text-lime-400 transition-colors"
                            >
                                The Story of KALE
                            </div>
                            <div class="text-xs text-slate-500">
                                Official Stellar Foundation article
                            </div>
                        </div>
                        <svg
                            class="w-5 h-5 text-slate-500 group-hover:text-lime-400 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </a>

                    <a
                        href="https://kalefarm.xyz"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-4 p-4 bg-black/40 rounded-xl border border-slate-700/50 hover:border-lime-500/30 hover:bg-lime-500/5 transition-all group"
                    >
                        <div class="w-10 h-10 flex items-center justify-center">
                            <KaleEmoji size="w-8 h-8" />
                        </div>
                        <div class="flex-1">
                            <div
                                class="text-slate-200 font-bold group-hover:text-lime-400 transition-colors"
                            >
                                Kale Farm
                            </div>
                            <div class="text-xs text-slate-500">
                                Plant, work, and harvest KALE
                            </div>
                        </div>
                        <svg
                            class="w-5 h-5 text-slate-500 group-hover:text-lime-400 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </a>

                    <a
                        href="https://lobstr.co"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-4 p-4 bg-black/40 rounded-xl border border-slate-700/50 hover:border-lime-500/30 hover:bg-lime-500/5 transition-all group"
                    >
                        <img
                            src="https://lobstr.co/static/images/lobstr-icon.png"
                            alt="Lobstr"
                            class="w-10 h-10 rounded-lg"
                        />
                        <div class="flex-1">
                            <div
                                class="text-slate-200 font-bold group-hover:text-lime-400 transition-colors"
                            >
                                Lobstr Wallet
                            </div>
                            <div class="text-xs text-slate-500">
                                The best mobile wallet for Stellar
                            </div>
                        </div>
                        <svg
                            class="w-5 h-5 text-slate-500 group-hover:text-lime-400 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </a>

                    <a
                        href="https://stellarx.com/markets/KALE:GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE/native"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-4 p-4 bg-black/40 rounded-xl border border-slate-700/50 hover:border-lime-500/30 hover:bg-lime-500/5 transition-all group"
                    >
                        <img
                            src="https://stellarx.com/favicon.ico"
                            alt="StellarX"
                            class="w-10 h-10"
                        />
                        <div class="flex-1">
                            <div
                                class="text-slate-200 font-bold group-hover:text-lime-400 transition-colors"
                            >
                                Trade on StellarX
                            </div>
                            <div class="text-xs text-slate-500">
                                KALE/XLM trading market
                            </div>
                        </div>
                        <svg
                            class="w-5 h-5 text-slate-500 group-hover:text-lime-400 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </a>

                    <a
                        href="https://kalepail.com/kale"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-4 p-4 bg-black/40 rounded-xl border border-slate-700/50 hover:border-lime-500/30 hover:bg-lime-500/5 transition-all group"
                    >
                        <div
                            class="w-10 h-10 flex items-center justify-center text-2xl"
                        >
                            📖
                        </div>
                        <div class="flex-1">
                            <div
                                class="text-slate-200 font-bold group-hover:text-lime-400 transition-colors"
                            >
                                Full Lore & Docs
                            </div>
                            <div class="text-xs text-slate-500">
                                Deep dive into the KALE universe
                            </div>
                        </div>
                        <svg
                            class="w-5 h-5 text-slate-500 group-hover:text-lime-400 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </a>
                </div>

                <!-- Footer Quote -->
                <div class="text-center pt-8 border-t border-slate-800">
                    <p class="text-slate-500 text-sm italic">
                        "In the fields of Demeter, every farmer matters."
                    </p>
                    <p class="text-slate-600 text-xs mt-2">
                        🥬 The KALE community
                    </p>
                </div>
            </div>
        </div>
    </div>
</div>
