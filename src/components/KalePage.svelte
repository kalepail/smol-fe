<script lang="ts">
    import KaleEmoji from "../components/ui/KaleEmoji.svelte";
</script>

<div
    class="h-screen bg-gradient-to-br from-slate-950 via-emerald-950/20 to-slate-950 flex items-center justify-center p-4 overflow-hidden"
>
    <div class="max-w-4xl w-full">
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
            <p class="text-slate-500 text-xs font-pixel">
                a collaborative proof of teamwork asset on Stellar
            </p>
        </div>

        <!-- Main Grid -->
        <div class="grid md:grid-cols-3 gap-3 mb-6">
            <!-- Story Card -->
            <div
                class="bg-gradient-to-br from-lime-950/40 via-black/60 to-emerald-950/40 rounded-xl border border-lime-500/20 p-4"
            >
                <h2
                    class="text-sm font-pixel text-lime-400 mb-2 flex items-center gap-2"
                >
                    🪐 The Lore
                </h2>
                <p class="text-slate-400 text-[10px] leading-relaxed">
                    On a distant planet called <span class="text-lime-300"
                        >Demeter</span
                    >, scientists discovered
                    <span class="text-lime-300">Kale-Corium</span> - a crystalline
                    vegetable that could end universal hunger. To protect it from
                    the villain Zebulon, they distributed farming across the cosmos.
                </p>
            </div>

            <!-- How it Works Card -->
            <div class="bg-black/40 rounded-xl border border-slate-700/50 p-4">
                <h2
                    class="text-sm font-pixel text-lime-400 mb-2 flex items-center gap-2"
                >
                    🌱 How It Works
                </h2>
                <div class="space-y-1 text-[10px]">
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
                class="bg-gradient-to-r from-purple-950/30 to-lime-950/30 rounded-xl border border-purple-500/20 p-4"
            >
                <h2
                    class="text-sm font-pixel text-purple-400 mb-2 flex items-center gap-2"
                >
                    🎵 KALE × SMOL
                </h2>
                <div class="grid grid-cols-2 gap-2 text-center">
                    <div class="bg-black/40 rounded-lg p-2">
                        <div class="text-sm font-bold text-lime-400">
                            100 <KaleEmoji size="w-3 h-3" />
                        </div>
                        <div class="text-[8px] text-slate-500">to mint</div>
                    </div>
                    <div class="bg-black/40 rounded-lg p-2">
                        <div class="text-sm font-bold text-lime-400">
                            ~33 <KaleEmoji size="w-3 h-3" />
                        </div>
                        <div class="text-[8px] text-slate-500">to buy</div>
                    </div>
                </div>
                <!-- Tipping & Splits -->
                <div class="mt-2 bg-black/40 rounded-lg p-2 text-center">
                    <div class="text-[9px] text-slate-300">
                        💚 Support artists, curators & minters
                    </div>
                    <div class="text-[7px] text-slate-500 mt-0.5">
                        50% • 30% • 20%
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
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate"
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
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate"
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
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate"
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
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate"
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
                        class="text-[10px] text-slate-200 group-hover:text-lime-400 truncate"
                    >
                        Full Lore
                    </div>
                </div>
            </a>
        </div>

        <!-- Footer -->
        <p class="text-center text-slate-600 text-[9px] italic">
            "In the fields of Demeter, every farmer matters." 🥬
        </p>
    </div>
</div>
