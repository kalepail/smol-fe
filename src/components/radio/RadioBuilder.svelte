<script lang="ts">
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    registerSongNextCallback,
  } from "../../stores/audio.svelte";
  import RadioPlayer from "./RadioPlayer.svelte";

  let { smols = [] }: { smols: Smol[] } = $props();

  const MAX_TAGS = 5;
  const TARGET_SONGS = 20;
  const INITIAL_TAG_LIMIT = 50;
  const API_URL = import.meta.env.PUBLIC_API_URL;

  // Genre popularity weights (based on streaming data patterns)
  const GENRE_POPULARITY: Record<string, number> = {
    Pop: 100,
    "Hip Hop": 95,
    Electronic: 90,
    "R&B": 85,
    Rock: 80,
    Dance: 78,
    Rap: 76,
    Indie: 72,
    House: 70,
    "Lo-Fi": 68,
    Soul: 65,
    Funk: 62,
    Jazz: 60,
    Acoustic: 58,
    Alternative: 55,
    EDM: 52,
    Trap: 50,
    Chill: 48,
    Ambient: 45,
    Country: 42,
    Reggae: 40,
    Metal: 38,
    Punk: 35,
    Blues: 32,
    Classical: 30,
  };

  let selectedTags = $state<string[]>([]);
  let searchQuery = $state("");
  let showAll = $state(false);
  let generatedPlaylist = $state<Smol[]>([]);
  let isGenerating = $state(false);
  let currentIndex = $state(0);
  let isShuffled = $state(true);
  let sortMode = $state<"popularity" | "frequency" | "alphabetical">(
    "popularity",
  );

  // Extract tags from smols
  function getTags(smol: Smol): string[] {
    const tags: string[] = [];
    if (smol.Tags) tags.push(...smol.Tags);
    if (smol.lyrics?.style) tags.push(...smol.lyrics.style);
    return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
  }

  // Aggregate all tags with counts
  let processedTags = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const smol of smols) {
      for (const tag of getTags(smol)) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }

    let allTags = Object.entries(counts).map(([tag, count]) => ({
      tag,
      count,
      popularity: GENRE_POPULARITY[tag] || 10 + count,
    }));

    // Sort based on mode
    if (sortMode === "popularity") {
      allTags.sort((a, b) => b.popularity - a.popularity || b.count - a.count);
    } else if (sortMode === "alphabetical") {
      allTags.sort((a, b) => a.tag.localeCompare(b.tag));
    } else {
      allTags.sort((a, b) => b.count - a.count);
    }

    return allTags;
  });

  let filteredTags = $derived.by(() => {
    if (!searchQuery) return processedTags;
    const q = searchQuery.toLowerCase();
    return processedTags.filter((t) => t.tag.toLowerCase().includes(q));
  });

  let displayedTags = $derived.by(() => {
    if (showAll || searchQuery) return filteredTags;
    return filteredTags.slice(0, INITIAL_TAG_LIMIT);
  });

  const maxCount = $derived(
    processedTags.length > 0 ? processedTags[0].count : 1,
  );

  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter((t) => t !== tag);
    } else if (selectedTags.length < MAX_TAGS) {
      selectedTags = [...selectedTags, tag];
    }
  }

  function removeTag(tag: string) {
    selectedTags = selectedTags.filter((t) => t !== tag);
  }

  function clearTags() {
    selectedTags = [];
  }

  function getFontSize(count: number, max: number): string {
    const minSize = 0.75;
    const maxSize = 1.6;
    const normalized = Math.log(count + 1) / Math.log(max + 1);
    return `${(minSize + (maxSize - minSize) * normalized).toFixed(2)}rem`;
  }

  function getOpacity(count: number, max: number): number {
    const min = 0.5;
    return min + (1 - min) * (Math.log(count + 1) / Math.log(max + 1));
  }

  function generateStation() {
    if (selectedTags.length === 0) return;
    isGenerating = true;

    const matching = smols.filter((smol) => {
      const tags = getTags(smol);
      return selectedTags.some((t) => tags.includes(t));
    });

    const scored = matching.map((smol) => {
      const tags = getTags(smol);
      const tagMatches = selectedTags.filter((t) => tags.includes(t)).length;
      const popularity = (smol.Plays || 0) + (smol.Views || 0) * 0.1;
      return {
        smol,
        score: tagMatches * 100 + popularity + Math.random() * 50,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    let selected = scored.slice(0, TARGET_SONGS).map((s) => s.smol);

    if (isShuffled) {
      selected = selected.sort(() => Math.random() - 0.5);
    }

    generatedPlaylist = selected;
    currentIndex = 0;
    isGenerating = false;

    if (selected.length > 0) {
      playSongAtIndex(0);
    }
  }

  function playSongAtIndex(index: number) {
    if (index >= 0 && index < generatedPlaylist.length) {
      currentIndex = index;
      selectSong(generatedPlaylist[index]);
    }
  }

  function playNext() {
    if (currentIndex < generatedPlaylist.length - 1) {
      playSongAtIndex(currentIndex + 1);
    }
  }

  function playPrev() {
    if (currentIndex > 0) {
      playSongAtIndex(currentIndex - 1);
    }
  }

  $effect(() => {
    if (generatedPlaylist.length > 0) {
      registerSongNextCallback(playNext);
      return () => registerSongNextCallback(null);
    }
  });

  const estimatedDuration = $derived(
    Math.round(generatedPlaylist.length * 2.5),
  );
</script>

<div class="container mx-auto px-4 py-8">
  <div class="mb-8">
    <div
      class="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 gap-4"
    >
      <div>
        <h2 class="text-2xl font-bold text-purple-400">📻 RADIO STATION</h2>
        <p class="text-slate-400 text-sm mt-1">
          Select up to {MAX_TAGS} tags to generate your station
        </p>
      </div>
      <div class="flex gap-2 items-center">
        <select
          bind:value={sortMode}
          class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
        >
          <option value="popularity">Sort: Popularity</option>
          <option value="frequency">Sort: Frequency</option>
          <option value="alphabetical">Sort: A-Z</option>
        </select>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search tags..."
          class="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors w-48"
        />
      </div>
    </div>

    {#if selectedTags.length > 0}
      <div class="flex flex-wrap gap-2 mb-4">
        {#each selectedTags as tag}
          <span
            class="inline-flex items-center gap-1 bg-purple-600/30 text-purple-300 px-3 py-1 rounded-full text-sm border border-purple-500/50"
          >
            {tag}
            <button class="hover:text-white ml-1" onclick={() => removeTag(tag)}
              >×</button
            >
          </span>
        {/each}
        <button
          class="text-xs text-slate-500 hover:text-purple-400 transition-colors"
          onclick={clearTags}>Clear all</button
        >
      </div>
    {/if}

    <div
      class="flex flex-col items-center p-6 bg-slate-900/50 rounded-2xl border border-slate-800"
    >
      <div
        class="flex flex-wrap gap-x-3 gap-y-1.5 justify-center max-h-64 overflow-y-auto dark-scrollbar w-full"
      >
        {#each displayedTags as { tag, count }}
          <button
            class="transition-all duration-200 hover:text-purple-400 hover:scale-105 leading-none py-1 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            class:text-purple-400={selectedTags.includes(tag)}
            class:text-white={!selectedTags.includes(tag)}
            class:font-bold={selectedTags.includes(tag)}
            style="font-size: {getFontSize(
              count,
              maxCount,
            )}; opacity: {selectedTags.includes(tag)
              ? 1
              : getOpacity(count, maxCount)}"
            onclick={() => toggleTag(tag)}
            disabled={!selectedTags.includes(tag) &&
              selectedTags.length >= MAX_TAGS}
          >
            {tag}
            {#if selectedTags.includes(tag)}
              <span class="text-xs align-top ml-0.5 opacity-60">({count})</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if filteredTags.length === 0}
        <div class="text-slate-500 italic mt-4">No tags found.</div>
      {/if}

      {#if !searchQuery && processedTags.length > INITIAL_TAG_LIMIT}
        <button
          class="mt-6 text-xs font-bold tracking-widest text-slate-500 hover:text-purple-400 transition-colors uppercase border-t border-slate-800 pt-4 w-full"
          onclick={() => (showAll = !showAll)}
        >
          {showAll ? "Show Less" : `Show All (${processedTags.length} Tags)`}
        </button>
      {/if}
    </div>

    <div class="flex justify-center mt-6 gap-4 items-center">
      <label
        class="flex items-center gap-2 text-slate-400 text-sm cursor-pointer"
      >
        <input
          type="checkbox"
          bind:checked={isShuffled}
          class="accent-purple-500 w-4 h-4"
        />
        Shuffle
      </label>
      <button
        class="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 px-8 rounded-full transition-all duration-200 disabled:cursor-not-allowed"
        onclick={generateStation}
        disabled={selectedTags.length === 0 || isGenerating}
      >
        {isGenerating
          ? "Generating..."
          : `🎲 Generate Station (${selectedTags.length}/${MAX_TAGS} tags)`}
      </button>
    </div>
  </div>

  {#if generatedPlaylist.length > 0}
    <div class="animate-fade-in-up">
      <RadioPlayer
        playlist={generatedPlaylist}
        onNext={playNext}
        onPrev={playPrev}
      />

      <div class="flex justify-between items-center mb-4 mt-6">
        <h3 class="text-xl font-semibold text-white">
          Your Radio Station
          <span class="text-sm text-slate-500 font-normal ml-2"
            >({generatedPlaylist.length} songs • ~{estimatedDuration} min)</span
          >
        </h3>
      </div>

      <div
        class="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden"
      >
        <ul
          class="divide-y divide-slate-800 max-h-96 overflow-y-auto dark-scrollbar"
        >
          {#each generatedPlaylist as song, index}
            <li>
              <button
                class="w-full flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors text-left {index ===
                currentIndex
                  ? 'bg-purple-900/30'
                  : ''}"
                onclick={() => playSongAtIndex(index)}
              >
                <span class="text-slate-500 w-6 text-right text-sm"
                  >{index + 1}</span
                >
                <span
                  class="w-10 h-10 rounded bg-slate-800 flex-shrink-0 relative overflow-hidden"
                >
                  <img
                    src={`${API_URL}/image/${song.Id}.png`}
                    alt=""
                    class="w-full h-full object-cover"
                    loading="lazy"
                    onerror={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span
                    class="absolute inset-0 flex items-center justify-center text-slate-500 text-lg"
                    >♪</span
                  >
                </span>
                <div class="flex-1 min-w-0">
                  <div
                    class="font-medium truncate {index === currentIndex
                      ? 'text-purple-300'
                      : 'text-white'}"
                  >
                    {song.lyrics?.title || song.Title || "Untitled"}
                  </div>
                  <div class="text-xs text-slate-500 truncate">
                    {getTags(song).slice(0, 3).join(", ") || "No tags"}
                  </div>
                </div>
                {#if index === currentIndex && audioState.playingId === song.Id}
                  <span class="text-purple-400 animate-pulse">▶</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {:else if selectedTags.length > 0}
    <div class="text-center text-slate-500 mt-12">
      Click "Generate Station" to create your radio playlist.
    </div>
  {:else}
    <div class="text-center text-slate-500 mt-12">
      Select some tags above to get started.
    </div>
  {/if}
</div>

<style>
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .animate-fade-in-up {
    animation: fadeInUp 0.4s ease-out forwards;
  }
  .dark-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .dark-scrollbar::-webkit-scrollbar-track {
    background: rgba(30, 41, 59, 0.5);
    border-radius: 4px;
  }
  .dark-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(100, 116, 139, 0.6);
    border-radius: 4px;
  }
  .dark-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.8);
  }
  .dark-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(100, 116, 139, 0.6) rgba(30, 41, 59, 0.5);
  }
</style>
