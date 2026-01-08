<script lang="ts">
    import type { Smol, SmolDetailResponse } from "../../types/domain";
    import {
        audioState,
        selectSong,
        togglePlayPause,
        isPlaying,
    } from "../../stores/audio.svelte";
    import { navigate } from "astro:transitions/client";
    import RadioPlayer from "../radio/RadioPlayer.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import Loader from "../ui/Loader.svelte";
    import TokenBalancePill from "../ui/TokenBalancePill.svelte";
    import { userState, isAuthenticated } from "../../stores/user.svelte";
    import { updateContractBalance } from "../../stores/balance.svelte";
    import { useSmolMinting } from "../../hooks/useSmolMinting";
    import { sac } from "../../utils/passkey-kit";
    import { getTokenBalance } from "../../utils/balance";
    import MintTradeModal from "../MintTradeModal.svelte";
    import TipArtistModal from "../artist/TipArtistModal.svelte";

    let { id }: { id: string } = $props();

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

    // Data State
    let data = $state<SmolDetailResponse | null>(null);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showTradeModal = $state(false);
    let minting = $state(false);
    let showTipModal = $state(false);
    let activeTab = $state<"lyrics" | "metadata">("lyrics");
    let autoScroll = $state(false); // Enable auto-scroll (Default OFF)
    let tradeMintBalance = $state(0n); // Restored missing state

    // Context-aware back navigation
    let backContext = $state<{
        type: "radio" | "artist";
        label: string;
    } | null>(null);

    $effect(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const from = params.get("from");
            if (from === "radio") {
                backContext = { type: "radio", label: "Back to Radio" };
            } else if (from === "artist") {
                backContext = { type: "artist", label: "Back to Artist" };
            }
        }
    });

    const mintingHook = useSmolMinting();

    // Version Handling
    let selectedVersionId = $state<string | null>(null);

    const versions = $derived.by(() => {
        if (!data?.kv_do?.songs) return [];
        // Map song IDs to V1, V2 labels
        return data.kv_do.songs.map((s, i) => ({
            id: s.music_id,
            label: `V${i + 1}`,
            isBest: s.music_id === data?.d1?.Song_1,
            audio: s.audio,
        }));
    });

    // Set default version on load
    $effect(() => {
        if (!selectedVersionId && versions.length > 0) {
            const best = versions.find((v) => v.isBest);
            selectedVersionId = best ? best.id : versions[0].id;
        }
    });

    // Derived track object for player with DYNAMIC AUDIO
    const track = $derived.by(() => {
        if (!data?.d1) return null;

        let audioUrl = "";
        if (selectedVersionId) {
            audioUrl = `${API_URL}/song/${selectedVersionId}.mp3`;
        } else if (data?.d1?.Song_1) {
            audioUrl = `${API_URL}/song/${data.d1.Song_1}.mp3`;
        }

        return {
            ...data.d1,
            Liked: data.liked,
            Tags: data.kv_do?.lyrics?.style || [],
            Song_1: selectedVersionId || data.d1?.Song_1 || "",
            kv_do: data.kv_do,
        } as Smol;
    });

    // RESTORED LOGIC FROM ORIGINAL FILE
    const isOwner = $derived(data?.d1?.Address === userState.contractId);
    const tradeReady = $derived(
        Boolean(id && data?.d1?.Mint_Amm && data?.d1?.Mint_Token),
    );
    const minted = $derived(
        Boolean(data?.d1?.Mint_Token || data?.d1?.Mint_Amm),
    );

    // Lyrics
    let lyricsContainerRef = $state<HTMLDivElement | null>(null);
    const lyrics = $derived(data?.kv_do?.lyrics?.lyrics || "");
    const lyricsLines = $derived(
        lyrics
            ? lyrics
                  .split("\n")
                  .map((l) => l.replace(/\[.*?\]/g, "").trim())
                  .filter((l) => l.length > 0)
            : [],
    );

    async function fetchData() {
        loading = true;
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to load track");
            data = await res.json();

            // Auto-play if not already playing something else
            if (track) {
                selectSong(track);
            }
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (id) fetchData();
    });

    // Fetch mint balance
    $effect(() => {
        const mintToken = data?.d1?.Mint_Token;
        const contractId = userState.contractId;
        if (mintToken && contractId) {
            const client = sac.getSACClient(mintToken);
            getTokenBalance(client, contractId).then(
                (b) => (tradeMintBalance = b),
            );
        }
    });

    // Lyrics auto-scroll
    $effect(() => {
        const container = lyricsContainerRef;
        if (
            !container ||
            !isPlaying() ||
            lyricsLines.length === 0 ||
            !autoScroll
        )
            return;

        const intervalId = setInterval(() => {
            const progress = audioState.progress;
            const maxScroll = container.scrollHeight - container.clientHeight;
            container.scrollTop = (progress / 100) * maxScroll;
        }, 1000);

        return () => clearInterval(intervalId);
    });

    async function triggerMint() {
        if (!id || minting || minted) return;
        if (!userState.contractId) return alert("Connect wallet to mint");

        try {
            minting = true;
            await mintingHook.triggerMint(
                {
                    id,
                    contractId: userState.contractId,
                    keyId: userState.keyId!,
                    smolContractId:
                        import.meta.env.PUBLIC_SMOL_CONTRACT_ID ||
                        "CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA",
                    rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
                    networkPassphrase: import.meta.env
                        .PUBLIC_NETWORK_PASSPHRASE!,
                    creatorAddress: data?.d1?.Address || "",
                    kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID!,
                },
                () => fetchData(),
            );
        } catch (e: any) {
            alert(e.message);
        } finally {
            minting = false;
        }
    }

    async function togglePublic() {
        await fetch(`${API_URL}/${id}`, {
            method: "PUT",
            credentials: "include",
        });
        fetchData();
    }

    async function deleteSong() {
        if (!confirm("Delete this song?")) return;
        await fetch(`${API_URL}/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        window.location.href = "/";
    }

    function share() {
        navigator
            .share?.({
                title: data?.d1?.Title,
                url: window.location.href,
            })
            .catch(() => {
                navigator.clipboard.writeText(window.location.href);
                alert("Link copied!");
            });
    }

    // Copy any value to clipboard with visual feedback
    let copiedField = $state<string | null>(null);
    async function copyToClipboard(
        value: string | undefined | null,
        fieldName: string,
    ) {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            copiedField = fieldName;
            setTimeout(() => (copiedField = null), 1500);
        } catch (e) {
            // Fallback for older browsers
            const textarea = document.createElement("textarea");
            textarea.value = value;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            copiedField = fieldName;
            setTimeout(() => (copiedField = null), 1500);
        }
    }
</script>

<div class="max-w-6xl mx-auto px-4 font-mono overflow-x-hidden">
    {#if loading}
        <div class="flex items-center justify-center py-32">
            <Loader classNames="w-12 h-12" textColor="text-[#d836ff]" />
        </div>
    {:else if error}
        <div class="text-center py-32">
            <h2 class="text-2xl font-bold text-red-500 mb-4">Error</h2>
            <p class="text-white/40">{error}</p>
            <a href="/" class="mt-8 inline-block text-[#d836ff] hover:underline"
                >Back Home</a
            >
        </div>
    {:else if data}
        <div class="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <!-- Main Portal -->
            <div
                class="reactive-glass border border-white/5 bg-[#1a1a1a] overflow-hidden rounded-2xl shadow-2xl"
            >
                <!-- Top Nav / Action Bar -->
                <div
                    class="flex items-center justify-between px-6 py-2 bg-black/40 border-b border-white/5"
                >
                    <div
                        class="flex items-center gap-4 min-w-0 overflow-hidden flex-1"
                    >
                        <div
                            class="text-[#d836ff] drop-shadow-[0_0_8px_#d836ff]"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                class="w-4 h-4"
                                fill="currentColor"
                            >
                                <path
                                    d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                                />
                            </svg>
                        </div>
                        <div class="flex items-baseline gap-3 overflow-hidden">
                            <span
                                class="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 whitespace-nowrap hidden sm:inline"
                                >Track Detail /</span
                            >
                            <span
                                class="text-xs font-bold text-white tracking-tight truncate"
                                >{data.d1?.Title || "Untitled"}</span
                            >
                            <span
                                class="text-[9px] text-[#d836ff]/60 uppercase tracking-widest flex items-center gap-1 shrink-0"
                            >
                                BY <a
                                    href="/artist/{data.d1?.Address}"
                                    onclick={(e) => {
                                        e.preventDefault();
                                        if (data?.d1?.Address) {
                                            navigate(
                                                `/artist/${data.d1.Address}?play=${id}`,
                                            );
                                        }
                                    }}
                                    class="hover:underline text-[#d836ff]"
                                    >{data.d1?.Address?.slice(0, 8) || "..."}</a
                                >
                            </span>
                        </div>

                        <div class="flex gap-2 ml-2">
                            {#if minted}
                                <span
                                    class="px-2 py-0.5 rounded bg-[#d836ff]/10 text-[#d836ff] text-[8px] border border-[#d836ff]/20 uppercase font-bold tracking-widest"
                                    >MINTED</span
                                >
                            {/if}
                            {#if data.kv_do?.nsfw?.safe === false}
                                <span
                                    class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[8px] border border-rose-500/20 uppercase font-bold tracking-widest"
                                    >NSFW</span
                                >
                            {/if}
                        </div>
                    </div>

                    <div class="flex items-center gap-4">
                        {#if isOwner}
                            <button
                                onclick={deleteSong}
                                class="text-[9px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-400"
                            >
                                Delete
                            </button>
                        {/if}
                    </div>
                </div>

                <div
                    class="flex flex-col lg:flex-row gap-2 lg:gap-8 items-stretch px-4 py-8 lg:p-6 h-auto lg:h-[580px]"
                >
                    <!-- Left: Player Column -->
                    <div class="w-full lg:w-1/2 flex flex-col">
                        <RadioPlayer
                            playlist={track ? [track] : []}
                            currentIndex={0}
                            accentColor="#d836ff"
                            onSelect={() => {}}
                            onNext={() => {
                                // Navigate to artist page with song ID to continue playback
                                if (data?.d1?.Address && id) {
                                    navigate(
                                        `/artist/${data.d1.Address}?play=${id}`,
                                    );
                                }
                            }}
                            onPrev={() => {
                                // Restart song on "Previous" click
                                if (audioState.audioElement) {
                                    audioState.audioElement.currentTime = 0;
                                    if (!isPlaying()) togglePlayPause();
                                }
                            }}
                            onTrade={tradeReady
                                ? () => (showTradeModal = true)
                                : undefined}
                            {versions}
                            currentVersionId={selectedVersionId || ""}
                            onVersionSelect={(id) => {
                                selectedVersionId = id;
                                // Force player update if needed
                                if (track) selectSong(track);
                            }}
                            onMint={!minted ? triggerMint : undefined}
                            isMinting={minting}
                            isAuthenticated={isAuthenticated()}
                            showMiniActions={false}
                            onTogglePublish={isOwner ? togglePublic : undefined}
                            isPublished={!!data.d1?.Public}
                            likeOnArt={false}
                            enableContextBack={true}
                            overlayControlsOnMobile={true}
                            onTip={() => {
                                if (!isAuthenticated()) {
                                    window.dispatchEvent(
                                        new CustomEvent("smol:request-login"),
                                    );
                                    return;
                                }
                                showTipModal = true;
                            }}
                            onToggleLike={(idx, liked) => {}}
                            onShare={share}
                        />

                        <!-- Desktop Action Bar Removed -->
                    </div>

                    <!-- Right: Info/Lyrics Column -->
                    <div
                        class="w-full lg:w-1/2 flex flex-col h-[500px] lg:h-auto lg:min-h-0 bg-black/20 border border-white/5 rounded-2xl overflow-hidden shadow-inner isolate"
                    >
                        <!-- Content Tabs -->
                        <div
                            class="flex px-4 pt-4 gap-6 border-b border-white/5 flex-shrink-0 items-center justify-between"
                        >
                            <div class="flex gap-6">
                                <button
                                    onclick={() => (activeTab = "lyrics")}
                                    class="pb-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeTab ===
                                    'lyrics'
                                        ? 'text-[#d836ff] border-b-2 border-[#d836ff]'
                                        : 'text-white/30 hover:text-white'}"
                                    >Lyrics</button
                                >
                                <button
                                    onclick={() => (activeTab = "metadata")}
                                    class="pb-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeTab ===
                                    'metadata'
                                        ? 'text-[#d836ff] border-b-2 border-[#d836ff]'
                                        : 'text-white/30 hover:text-white'}"
                                    >Metadata</button
                                >
                            </div>

                            {#if activeTab === "lyrics"}
                                <button
                                    onclick={() => (autoScroll = !autoScroll)}
                                    class="pb-3 px-2 text-[10px] font-bold transition-all {autoScroll
                                        ? 'text-[#d836ff] drop-shadow-[0_0_8px_rgba(216,54,255,0.5)]'
                                        : 'text-white/20 hover:text-white/50'}"
                                    title={autoScroll
                                        ? "Auto-scroll ON"
                                        : "Auto-scroll OFF"}
                                >
                                    S
                                </button>
                            {/if}
                        </div>

                        <div class="flex-1 relative overflow-hidden group">
                            <div
                                bind:this={lyricsContainerRef}
                                class="h-full overflow-y-auto p-6 scroll-smooth dark-scrollbar"
                            >
                                {#if activeTab === "lyrics"}
                                    <div class="space-y-4">
                                        {#each lyricsLines as line}
                                            <p
                                                class="text-lg md:text-xl text-white/80 font-medium leading-relaxed hover:text-white transition-colors"
                                            >
                                                {line}
                                            </p>
                                        {/each}
                                    </div>
                                {:else}
                                    <div
                                        class="space-y-8 animate-in fade-in duration-300"
                                    >
                                        <!-- Technical Details (First) -->
                                        <div>
                                            <h4
                                                class="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-4 font-bold"
                                            >
                                                Technical Details
                                            </h4>
                                            <div
                                                class="grid grid-cols-2 gap-4 text-[11px]"
                                            >
                                                <!-- ID Field - Copyable -->
                                                <button
                                                    onclick={() =>
                                                        copyToClipboard(
                                                            id,
                                                            "id",
                                                        )}
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                                    title="Click to copy full ID"
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                                    >
                                                        ID
                                                        {#if copiedField === "id"}
                                                            <span
                                                                class="text-emerald-400 text-[8px]"
                                                                >✓ Copied!</span
                                                            >
                                                        {:else}
                                                            <svg
                                                                class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                                fill="currentColor"
                                                                viewBox="0 0 24 24"
                                                                ><path
                                                                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                                /></svg
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="text-white/80 font-mono truncate"
                                                    >
                                                        {id}
                                                    </div>
                                                </button>

                                                <!-- Address Field - Copyable -->
                                                <button
                                                    onclick={() =>
                                                        copyToClipboard(
                                                            data?.d1?.Address,
                                                            "address",
                                                        )}
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                                    title={data.d1?.Address ||
                                                        "Click to copy"}
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                                    >
                                                        Address
                                                        {#if copiedField === "address"}
                                                            <span
                                                                class="text-emerald-400 text-[8px]"
                                                                >✓ Copied!</span
                                                            >
                                                        {:else}
                                                            <svg
                                                                class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                                fill="currentColor"
                                                                viewBox="0 0 24 24"
                                                                ><path
                                                                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                                /></svg
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="text-[#d836ff] font-mono truncate"
                                                    >
                                                        {data.d1?.Address?.slice(
                                                            0,
                                                            16,
                                                        )}...
                                                    </div>
                                                </button>

                                                <!-- Mint Token Field - Copyable -->
                                                <button
                                                    onclick={() =>
                                                        copyToClipboard(
                                                            data?.d1
                                                                ?.Mint_Token,
                                                            "mint_token",
                                                        )}
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                                    title={data.d1
                                                        ?.Mint_Token ||
                                                        "Not minted"}
                                                    disabled={!data.d1
                                                        ?.Mint_Token}
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                                    >
                                                        Mint Token
                                                        {#if copiedField === "mint_token"}
                                                            <span
                                                                class="text-emerald-400 text-[8px]"
                                                                >✓ Copied!</span
                                                            >
                                                        {:else if data.d1?.Mint_Token}
                                                            <svg
                                                                class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                                fill="currentColor"
                                                                viewBox="0 0 24 24"
                                                                ><path
                                                                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                                /></svg
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="text-sky-400 font-mono truncate {!data
                                                            .d1?.Mint_Token
                                                            ? 'opacity-50'
                                                            : ''}"
                                                    >
                                                        {data.d1?.Mint_Token?.slice(
                                                            0,
                                                            16,
                                                        ) || "N/A"}{data.d1
                                                            ?.Mint_Token
                                                            ? "..."
                                                            : ""}
                                                    </div>
                                                </button>

                                                <div
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5"
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest"
                                                    >
                                                        Creator Share
                                                    </div>
                                                    <div
                                                        class="text-emerald-400 font-mono uppercase"
                                                    >
                                                        10% Royalty
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Styles & Tags (Second) -->
                                        <div>
                                            <h4
                                                class="text-[9px] uppercase tracking-widest text-white/20 mb-3"
                                            >
                                                Styles & Tags
                                            </h4>
                                            <div class="flex flex-wrap gap-2">
                                                {#each data.kv_do?.lyrics?.style || [] as tag}
                                                    <span
                                                        class="px-2 py-1 rounded bg-[#d836ff]/5 text-[#d836ff]/50 text-[10px] border border-[#d836ff]/10"
                                                        >#{tag}</span
                                                    >
                                                {/each}
                                            </div>
                                        </div>

                                        <!-- Model Metadata (Third) -->
                                        <div>
                                            <h4
                                                class="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-4 font-bold"
                                            >
                                                Model Metadata
                                            </h4>
                                            <div
                                                class="p-4 rounded-xl bg-black/40 border border-white/5 space-y-4"
                                            >
                                                <div>
                                                    <div
                                                        class="text-[9px] text-white/30 uppercase tracking-[0.2em] mb-2"
                                                    >
                                                        Primary Prompt
                                                    </div>
                                                    <p
                                                        class="text-xs text-white/70 italic leading-relaxed"
                                                    >
                                                        "{data.kv_do?.payload
                                                            ?.prompt ||
                                                            "No prompt stored"}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                {/if}

                                {#if activeTab === "lyrics" && lyricsLines.length === 0}
                                    <div
                                        class="h-full flex flex-col items-center justify-center text-center py-20"
                                    >
                                        <p
                                            class="text-white/20 italic text-sm mb-4"
                                        >
                                            No lyrics found for this track
                                        </p>
                                        <div
                                            class="w-12 h-1 bg-white/5 rounded-full"
                                        ></div>
                                    </div>
                                {/if}

                                <!-- Footer Info (Persistent) -->
                                <div
                                    class="mt-12 pt-12 border-t border-white/5 space-y-6"
                                ></div>
                            </div>

                            <!-- Fade overlays -->
                            <div
                                class="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#1a1a1a]/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                            ></div>
                            <div
                                class="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#1a1a1a]/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

{#if showTipModal && data?.d1}
    <TipArtistModal
        artistAddress={data.d1.Address || ""}
        onClose={() => (showTipModal = false)}
    />
{/if}

{#if showTradeModal && data?.d1 && tradeReady}
    <MintTradeModal
        ammId={data.d1.Mint_Amm!}
        mintTokenId={data.d1.Mint_Token!}
        songId={id}
        title={data.d1.Title}
        imageUrl={`${API_URL}/image/${id}.png?scale=8`}
        on:close={() => (showTradeModal = false)}
        on:complete={() => {
            fetchData();
            showTradeModal = false;
        }}
    />
{/if}

<style>
    .dark-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .dark-scrollbar::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
    }
    .dark-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
    }
    .dark-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }
</style>
