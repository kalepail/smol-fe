<script lang="ts">
  import type { SmolDetailResponse } from "../types/domain";
  import { onMount, onDestroy } from "svelte";
  import SmolGenerator from "./smol/SmolGenerator.svelte";
  import CreatorSplash from "./onboarding/CreatorSplash.svelte";
  import SmolDisplay from "./smol/SmolDisplay.svelte";
  import MintTradeModal from "./MintTradeModal.svelte";
  import { userState } from "../stores/user.svelte.ts";
  import { updateContractBalance } from "../stores/balance.svelte.ts";
  import { useSmolGeneration } from "../hooks/useSmolGeneration";
  import { useSmolMinting } from "../hooks/useSmolMinting";
  import { audioState } from "../stores/audio.svelte.ts";
  import { sac } from "../utils/passkey-kit";
  import { getTokenBalance } from "../utils/balance";
  import { RPC_URL } from "../utils/rpc";

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

  interface Props {
    id?: string | null;
  }

  let { id = $bindable() }: Props = $props();

  // State
  let data = $state<SmolDetailResponse | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let d1 = $state<SmolDetailResponse["d1"]>(undefined);
  let kv_do = $state<SmolDetailResponse["kv_do"]>(undefined);
  let liked = $state<boolean | undefined>(undefined);
  let prompt = $state("");
  let is_public = $state(true);
  let is_instrumental = $state(false);
  let best_song = $state<string | undefined>(undefined);
  let audioElements = $state<HTMLAudioElement[]>([]);
  let interval = $state<NodeJS.Timeout | null>(null);
  let failed = $state(false);
  let playlist = $state<string | null>(null);
  let minting = $state(false);
  let showTradeModal = $state(false);
  let tradeMintBalance = $state<bigint>(0n);
  let shouldRefreshBalance = $state(false);
  let isGenerating = $state(false);

  // Hooks
  const generationHook = useSmolGeneration();
  const mintingHook = useSmolMinting();

  // Derived
  const minted = $derived(Boolean(d1?.Mint_Token || d1?.Mint_Amm));
  const tradeReady = $derived(Boolean(id && d1?.Mint_Amm && d1?.Mint_Token));
  const isOwner = $derived(d1?.Address === userState.contractId);
  const maxLength = $derived(is_instrumental ? 380 : 2280);
  const tradeSongId = $derived(id ?? d1?.Id ?? null);
  const tradeTitle = $derived(
    kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null,
  );
  const tradeImageUrl = $derived(
    tradeSongId ? `${API_URL}/image/${tradeSongId}.png` : null,
  );
  const tradeImageFallback = $derived(
    kv_do?.image_base64 ? `data:image/png;base64,${kv_do.image_base64}` : null,
  );

  // Effects
  $effect(() => {
    if (!tradeReady && showTradeModal) {
      showTradeModal = false;
    }
  });

  // Initialize best_song from d1?.Song_1, but preserve manual overrides
  $effect(() => {
    if (d1?.Song_1 && !best_song) {
      best_song = d1.Song_1;
    }
  });

  // Track previous minted state to only update balance when mint completes
  let wasMinted = $state(false);
  $effect(() => {
    // Only update balance when transitioning from unminted -> minted
    if (minted && !wasMinted) {
      minting = false;
      mintingHook.clearMintPolling();
      if (userState.contractId) {
        updateContractBalance(userState.contractId);
      }
    }
    wasMinted = minted;
  });

  // Track last fetched values to prevent duplicate balance fetches
  let lastFetchedMintToken = $state<string | null>(null);
  let lastFetchedUser = $state<string | null>(null);

  // Fetch mint balance when available
  $effect(() => {
    const mintToken = d1?.Mint_Token;
    const contractId = userState.contractId;

    if (mintToken && contractId) {
      // Only fetch if values actually changed
      if (
        mintToken !== lastFetchedMintToken ||
        contractId !== lastFetchedUser
      ) {
        lastFetchedMintToken = mintToken;
        lastFetchedUser = contractId;

        sac.get().then((kit) => {
          const client = kit.getSACClient(mintToken);
          getTokenBalance(client, contractId)
            .then((balance) => {
              tradeMintBalance = balance;
            })
            .catch((error) => {
              console.error("Failed to fetch mint token balance:", error);
              tradeMintBalance = 0n;
            });
        });
      }
    } else if (!mintToken) {
      tradeMintBalance = 0n;
      lastFetchedMintToken = null;
      lastFetchedUser = null;
    }
  });

  // Track last fetched ID to prevent duplicate fetches
  let lastFetchedId = $state<string | null>(null);

  // Fetch smol data when id changes
  async function fetchSmolData(smolId: string) {
    loading = true;
    error = null;

    try {
      const response = await fetch(`${API_URL}/${smolId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load smol");
      }

      data = await response.json();
      d1 = data?.d1;
      kv_do = data?.kv_do;
      liked = data?.liked;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load";
      console.error("Failed to fetch smol data:", err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Only fetch if id actually changed and we're not currently generating
    // During generation, the polling interval handles data fetching
    if (id && id !== lastFetchedId && !isGenerating) {
      lastFetchedId = id;
      fetchSmolData(id);
    }
  });

  onMount(async () => {
    switch (data?.wf?.status) {
      case "queued":
      case "running":
      case "paused":
      case "waiting":
      case "waitingForPause":
        interval = setInterval(getGen, 1000 * 6);
        break;
      case "errored":
      case "terminated":
      case "unknown":
        failed = true;
        break;
    }

    const urlParams = new URLSearchParams(window.location.search);
    playlist =
      urlParams.get("playlist") || localStorage.getItem("smol:playlist");

    if (playlist) {
      localStorage.setItem("smol:playlist", playlist);
    }
  });

  onDestroy(() => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    mintingHook.clearMintPolling();
  });

  function playAudio(index: number) {
    // Pause and clear global audio player if it's playing
    if (audioState.audioElement && !audioState.audioElement.paused) {
      audioState.audioElement.pause();
    }
    audioState.playingId = null;
    audioState.currentSong = null;

    // Pause all local audio elements except the one being played
    audioElements.forEach((audio, i) => {
      if (i !== index) {
        audio.pause();
      } else {
        audio.play();
      }
    });
  }

  // Effect: Pause local audio elements when global player starts playing
  $effect(() => {
    const globalPlayingId = audioState.playingId;
    const globalAudio = audioState.audioElement;

    if (globalPlayingId && globalAudio && !globalAudio.paused) {
      // Global player is playing, pause all local audio elements
      audioElements.forEach((audio) => {
        if (!audio.paused) {
          audio.pause();
        }
      });
    }
  });

  function removePlaylist() {
    const url = new URL(window.location.href);
    url.searchParams.delete("playlist");
    history.replaceState({}, "", url.toString());
    localStorage.removeItem("smol:playlist");
    playlist = null;
    location.reload();
  }

  function limitPromptLength() {
    if (prompt.length > maxLength) {
      prompt = prompt.substring(0, maxLength);
    }
  }

  async function makeSongPublic() {
    await fetch(`${API_URL}/${id}`, {
      method: "PUT",
      credentials: "include",
    });

    if (d1) {
      d1.Public = d1.Public === 1 ? 0 : 1;
    }
  }

  async function deleteSong() {
    if (!confirm("Are you sure you want to delete this song?")) return;

    await fetch(`${API_URL}/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    history.replaceState({}, "", "/");
    location.reload();
  }

  async function selectBestSong(song_id: string) {
    await fetch(`${API_URL}/${id}/${song_id}`, {
      method: "PUT",
      credentials: "include",
    });
  }

  async function postGen() {
    if (!prompt) return;

    isGenerating = true;
    id = null;
    d1 = undefined;
    kv_do = undefined;
    failed = false;

    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    id = await generationHook.postGen(
      prompt,
      is_public,
      is_instrumental,
      playlist,
    );
    prompt = "";

    interval = setInterval(getGen, 1000 * 6);
    await getGen();
  }

  async function retryGen() {
    isGenerating = true;
    d1 = undefined;
    kv_do = undefined;

    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    if (!id) return;

    id = await generationHook.retryGen(id);
    failed = false;
    interval = setInterval(getGen, 1000 * 6);
    await getGen();
  }

  async function triggerMint() {
    if (!id || minting || minted) return;

    if (!userState.contractId || !userState.keyId) {
      alert("Connect your wallet to mint");
      return;
    }

    const smolContractId =
      import.meta.env.PUBLIC_SMOL_CONTRACT_ID ||
      "CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA";
    if (!smolContractId) {
      alert("Minting is temporarily unavailable. Please try again later.");
      return;
    }

    try {
      minting = true;

      await mintingHook.triggerMint(
        {
          id,
          contractId: userState.contractId,
          keyId: userState.keyId,
          smolContractId,
          rpcUrl: RPC_URL,
          networkPassphrase: import.meta.env
            .PUBLIC_NETWORK_PASSPHRASE as string,
          creatorAddress: d1?.Address || "",
          kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID as string,
        },
        async () => {
          await getGen();
        },
      );
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : String(error));
      mintingHook.clearMintPolling();
      minting = false;
    }
  }

  async function getGen() {
    if (!id) return;

    const res = await generationHook.getGen(id);
    d1 = res?.d1;
    kv_do = res?.kv_do;
    best_song = d1?.Song_1;

    if (generationHook.shouldStopPolling(res?.wf?.status)) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      isGenerating = false;
      if (generationHook.isFailed(res.wf.status)) {
        failed = true;
      }
    }

    if (interval && d1) {
      clearInterval(interval);
      interval = null;
      isGenerating = false;
    }

    return res;
  }

  function openTradeModal() {
    if (!tradeReady) return;
    showTradeModal = true;
  }

  function handleTradeModalClose() {
    showTradeModal = false;
  }

  function handleTradeModalComplete() {
    showTradeModal = false;
    shouldRefreshBalance = true;
    void getGen();
  }
</script>

{#if loading}
  <div class="flex justify-center items-center py-20">
    <div class="text-lime-500">Loading...</div>
  </div>
{:else if error}
  <div class="flex justify-center items-center py-20">
    <div class="text-red-500">{error}</div>
  </div>
{:else if !id}
  {#if !userState.contractId}
    <CreatorSplash />
  {:else}
    <SmolGenerator
      bind:prompt
      bind:isPublic={is_public}
      bind:isInstrumental={is_instrumental}
      {playlist}
      isGenerating={!!id && !!interval}
      {maxLength}
      onPromptChange={limitPromptLength}
      onPublicChange={() => limitPromptLength()}
      onInstrumentalChange={() => limitPromptLength()}
      onSubmit={postGen}
      onRemovePlaylist={removePlaylist}
    />
  {/if}
{/if}

{#if id}
  {#if failed}
    <div class="px-2 py-10">
      <div class="flex flex-col items-center max-w-[1024px] mx-auto">
        <ul class="max-w-[512px] w-full [&>li]:mb-5">
          <li>
            <div class="flex items-center gap-2">
              <button
                class="flex items-center font-pixel tracking-wider text-[10px] text-lime-500 bg-lime-500/20 border-2 border-lime-500 hover:bg-lime-500/30 rounded-none px-3 py-1.5 disabled:opacity-50"
                onclick={retryGen}
                disabled={!!id && !!interval}
              >
                ⚡︎ Retry
              </button>
              {#if playlist}
                <span
                  class="flex items-center text-xs font-mono bg-lime-500 text-black px-2 py-1 rounded-full"
                >
                  {playlist}
                  <button
                    type="button"
                    onclick={removePlaylist}
                    class="ml-1.5 -mr-0.5 p-0.5 rounded-none hover:bg-black/20 text-black"
                    aria-label="Remove playlist"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      class="size-3"
                    >
                      <path
                        d="M2.22 2.22a.75.75 0 0 1 1.06 0L8 6.94l4.72-4.72a.75.75 0 0 1 1.06 1.06L9.06 8l4.72 4.72a.75.75 0 1 1-1.06 1.06L8 9.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L6.94 8 2.22 3.28a.75.75 0 0 1 0-1.06Z"
                      />
                    </svg>
                  </button>
                </span>
              {/if}
            </div>
          </li>
        </ul>
      </div>
    </div>
  {/if}

  <SmolDisplay
    {id}
    {d1}
    {kv_do}
    {liked}
    bind:bestSong={best_song}
    {interval}
    {minting}
    {minted}
    {tradeReady}
    {tradeMintBalance}
    {isOwner}
    bind:audioElements
    onMakeSongPublic={makeSongPublic}
    onDeleteSong={deleteSong}
    onSelectBestSong={selectBestSong}
    onPlayAudio={playAudio}
    onTriggerMint={triggerMint}
    onOpenTradeModal={openTradeModal}
    onLikeChanged={(likedValue) => (liked = likedValue)}
  />
{/if}

{#if showTradeModal && tradeReady && d1?.Mint_Amm && d1?.Mint_Token && tradeSongId}
  <MintTradeModal
    ammId={d1.Mint_Amm}
    mintTokenId={d1.Mint_Token}
    songId={tradeSongId}
    title={tradeTitle ?? undefined}
    imageUrl={tradeImageUrl ?? undefined}
    fallbackImage={tradeImageFallback ?? undefined}
    on:close={handleTradeModalClose}
    on:complete={handleTradeModalComplete}
  />
{/if}
