<script lang="ts">
  import { onMount } from "svelte";
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    registerSongNextCallback,
    togglePlayPause,
    isPlaying as getIsPlaying,
  } from "../../stores/audio.svelte";
  import RadioPlayer from "./RadioPlayer.svelte";
  import RadioResults from "./RadioResults.svelte";
  import {
    moodToTags,
    generateStationName,
    generateStationDescription,
  } from "../../services/ai/gemini";
  import { publishMixtape } from "../../services/api/mixtapes";
  import { isAuthenticated } from "../../stores/user.svelte";
  import type { MixtapeDraft } from "../../types/domain";

  let { smols = [] }: { smols: Smol[] } = $props();

  const GEMINI_API_KEY = import.meta.env.PUBLIC_GEMINI_API_KEY;

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

  // Genealogies / Relationships for "Silent Merge"
  // If user selects key, we also look for values (Tier 3 match)
  const TAG_RELATIONSHIPS: Record<string, string[]> = {
    "hip hop": ["rap", "trap", "r&b", "urban", "drill", "grime"],
    rap: ["hip hop", "trap", "drill", "grime"],
    rock: ["metal", "punk", "grunge", "alternative", "indie rock"],
    indie: ["alternative", "indie rock", "bedroom pop", "shoegaze"],
    electronic: ["house", "techno", "edm", "dance", "trance", "dubstep"],
    house: ["electronic", "techno", "deep house", "tech house"],
    techno: ["electronic", "house", "minimal", "acid"],
    pop: ["indie pop", "dance", "k-pop"],
    "r&b": ["soul", "hip hop", "urban", "funk"],
    jazz: ["soul", "blues", "funk"],
    metal: ["rock", "punk", "hardcore"],
    "lo-fi": ["chill", "ambient", "beats", "study", "downtempo"],
    chill: ["lo-fi", "ambient", "downtempo"],
    ambient: ["chill", "drone", "atmospheric"],
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

  // AI-powered features
  let moodInput = $state("");
  let isFetchingMood = $state(false);
  let stationName = $state("Your Radio Station");
  let stationDescription = $state("");
  let isSavingMixtape = $state(false);
  let isAiLoading = $state(false);
  let isDreamMode = $state(false);
  let isActiveGlobalShuffle = $state(false);

  let isPlaying = $derived(getIsPlaying());

  // AI Assist Handler
  async function handleAiAssist() {
    if (isAiLoading) return;
    isAiLoading = true;

    try {
      // Gather context
      const context =
        moodInput.trim().length > 0
          ? moodInput
          : selectedTags.length > 0
            ? `Tags: ${selectedTags.join(", ")}`
            : "A fresh mix of upbeat onchain music";

      const res = await fetch("/api/radio/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });

      if (!res.ok) throw new Error("AI Request failed");

      const data = await res.json();

      if (data.playlistName) stationName = data.playlistName;
      if (data.tags && Array.isArray(data.tags)) {
        // Clear previous tags if dreaming a new vibe
        if (moodInput.trim().length > 0) {
          selectedTags = data.tags.slice(0, 8);
        } else {
          // Otherwise append/merge
          const newTags = data.tags.filter(
            (t: string) => !selectedTags.includes(t),
          );
          selectedTags = [...selectedTags, ...newTags].slice(0, 8);
        }
      }
    } catch (e) {
      console.error("AI Assist failed:", e);
    } finally {
      isAiLoading = false;
    }
  }

  // History for Deduplication (prevent "same 20 songs" on re-roll)
  let recentlyGeneratedIds = $state<Set<string>>(new Set());

  // Handle URL params for "Send to Radio" feature from TagExplorer
  onMount(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const urlTags = params.getAll("tag");

    if (urlTags.length > 0) {
      // Set the tags from URL and auto-generate
      selectedTags = urlTags.slice(0, MAX_TAGS);

      // Short delay to allow component to initialize, then auto-generate
      setTimeout(() => {
        generateStation();
      }, 100);
    }
  });

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

  let isCompact = $derived(generatedPlaylist.length > 0 && !showBuilder);
  let showCloud = $derived(!isCompact || showAll);

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

  // Cache for AI responses to avoid repeating requests
  const suggestCache = new Map<string, string[]>();

  // Use full DB knowledge to find tags based on lyrics/titles
  function findTagsFromContent(terms: string[]): string[] {
    const termMatches = new Map<string, number>();

    smols.forEach((smol) => {
      const title = (smol.Title || "").toLowerCase();
      const lyrics = (smol.lyrics?.text || "").toLowerCase();

      const hits = terms.filter(
        (t) => title.includes(t) || lyrics.includes(t),
      ).length;
      if (hits > 0) {
        const smolTags = getTags(smol);
        smolTags.forEach((tag) => {
          termMatches.set(tag, (termMatches.get(tag) || 0) + hits);
        });
      }
    });

    // Return top tags found via content
    return Array.from(termMatches.entries())
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);
  }

  // Local fallback: simple keyword matching if API fails
  function localTagMatch(input: string): string[] {
    const terms = input.toLowerCase().split(/[\s,]+/);
    const normalizedTags = processedTags.map((t) => ({
      original: t.tag,
      norm: normalizeTag(t.tag),
    }));

    const matches = new Set<string>();

    // 1. Direct tag match
    for (const term of terms) {
      const termNorm = normalizeTag(term);
      const found = normalizedTags.find(
        (t) =>
          t.norm === termNorm ||
          (termNorm.length > 3 && t.norm.includes(termNorm)),
      );
      if (found) matches.add(found.original);
    }

    // 2. Vibe mapping (synonyms)
    const vibeMap: Record<string, string[]> = {
      chill: ["Lo-Fi", "Ambient", "Downtempo"],
      study: ["Lo-Fi", "Classical", "Instrumental"],
      party: ["Dance", "Pop", "Electronic", "House", "Hip Hop"],
      workout: ["Rock", "Hip Hop", "Trap", "Phonk"],
      sleep: ["Ambient", "Classical", "Solfeggio"],
      happy: ["Pop", "Indie Pop", "Disco"],
      sad: ["Acoustic", "Blues", "Emo"],
      focus: ["Deep House", "Techno", "Trance"],
      vibes: ["Lo-Fi", "Chill", "Ambient"],
      energy: ["Electronic", "Dance", "Metal"],
      relax: ["Acoustic", "Soul", "Jazz"],
    };

    for (const term of terms) {
      if (vibeMap[term]) {
        vibeMap[term].forEach((t) => matches.add(t));
      }
    }

    // 3. Deep Content Search (Lyrics/Titles)
    const contentTags = findTagsFromContent(terms);
    contentTags.slice(0, 5).forEach((t) => matches.add(t));

    // Filter to only available tags
    return Array.from(matches)
      .filter((t) => processedTags.some((pt) => pt.tag === t))
      .slice(0, MAX_TAGS);
  }

  // AI: Convert mood description to tag suggestions
  async function suggestTagsFromMood() {
    const input = moodInput.trim();
    if (!input) return;

    isFetchingMood = true;
    let suggestions: string[] = [];

    // 1. Check Cache
    if (suggestCache.has(input.toLowerCase())) {
      suggestions = suggestCache.get(input.toLowerCase()) || [];
    } else if (GEMINI_API_KEY) {
      // 2. Try API (only if key exists)
      try {
        const allTagNames = processedTags.map((t) => t.tag);
        suggestions = await moodToTags(input, allTagNames, GEMINI_API_KEY);

        if (suggestions.length > 0) {
          suggestCache.set(input.toLowerCase(), suggestions);
        }
      } catch (e) {
        console.warn("[AI] API failed, using fallback", e);
      }
    }

    // 3. Local Fallback if API returned nothing
    if (suggestions.length === 0) {
      console.log("[AI] Using local fallback");
      suggestions = localTagMatch(input);
    }

    // Clear previous tags if we found new ones (New Vibe)
    if (suggestions.length > 0) {
      selectedTags = [];
    }

    // Add suggested tags (up to max)
    for (const tag of suggestions) {
      if (!selectedTags.includes(tag) && selectedTags.length < MAX_TAGS) {
        selectedTags = [...selectedTags, tag];
      }
    }

    moodInput = "";
    isFetchingMood = false;

    // Auto-generate if we have tags
    if (selectedTags.length > 0) {
      setTimeout(() => generateStation(), 100);
    }
  }

  // Normalize tag for matching (remove special chars, lowercase)
  function normalizeTag(tag: string): string {
    return tag.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  async function generateStation() {
    isGenerating = true;
    stationName =
      selectedTags.length > 0 ? "Generating..." : "Global Shuffle...";
    stationDescription = "";

    const normalizedSelected = selectedTags.map(normalizeTag);

    // 3. Score & Filter (Weighted System)
    // We score ALL smols to find the best relevant ones
    const scored = smols
      .map((smol) => {
        let matchScore = 0;
        const tags = getTags(smol);
        let distinctMatches = 0;

        // Check for tiered matches
        normalizedSelected.forEach((sel, index) => {
          // Find if this specific selected tag matches anything in the song
          let bestTagScore = 0;

          // Order-Based Weighting: Earlier tags = Higher Priority
          // 1st tag: 100%, 2nd: 90%, 3rd: 80%, etc. (Decay 0.1 per slot, floor 0.5)
          const orderWeight = Math.max(0.5, 1 - index * 0.1);

          tags.forEach((t) => {
            const tNorm = normalizeTag(t);

            // Tier 1: Exact Match (100pts)
            if (tNorm === sel) {
              bestTagScore = Math.max(bestTagScore, 100);
            }
            // Tier 2: Broad/Substring Match (75pts) - Slightly reduced to prioritize exact
            else if (tNorm.includes(sel) || sel.includes(tNorm)) {
              // Length check to avoid noise (e.g. "pop" matching "pope")
              if (sel.length > 2 && tNorm.length > 2) {
                bestTagScore = Math.max(bestTagScore, 75);
              }
            }
            // Tier 3: Related Match (40pts) - Reduced to prevent dominance
            else if (TAG_RELATIONSHIPS[sel]?.includes(tNorm)) {
              bestTagScore = Math.max(bestTagScore, 40);
            }
          });

          if (bestTagScore > 0) {
            // Apply Order Weight here
            matchScore += bestTagScore * orderWeight;
            distinctMatches++;
          }
        });

        // Synergy Bonus: Boost songs that match MULTIPLE selected tags/concepts
        if (distinctMatches > 1) {
          matchScore *= 1.3; // 30% boost for multi-genre synergy (Stronger signal)
        }

        // Bonus: Check if tag appears in title or lyrics (Holistic)
        // Reduced to 25 to be a tie-breaker, not a primary driver
        const keywordBonus = normalizedSelected.some((term) => {
          const title = normalizeTag(smol.Title || "");
          const lyrics = normalizeTag(smol.lyrics?.text || "");
          return title.includes(term) || lyrics.includes(term);
        })
          ? 25
          : 0;

        // Popularity: drastically reduced to just be a tie-breaker (0.01)
        // This prevents pop songs from crashing a niche playlist just because they have 10k plays
        const popularity = (smol.Plays || 0) * 0.01 + (smol.Views || 0) * 0.005;

        // Deduplication Penalty
        // Strict Mode: If song was in previous batch, Score = 0 (Excluded completely)
        // This prevents repeats even if we run out of songs (shorter playlist = verified fresh)
        const historyPenalty = recentlyGeneratedIds.has(smol.Id) ? 0 : 1.0;

        const isGlobalShuffle = normalizedSelected.length === 0;

        // Only include if there is SOME relevance (score > 0) or if in global shuffle mode
        return {
          smol,
          // deterministic score (no random)
          score:
            matchScore > 0 || isGlobalShuffle
              ? (matchScore +
                  keywordBonus +
                  popularity +
                  (isGlobalShuffle ? 1 : 0)) *
                historyPenalty
              : 0,
        };
      })
      .filter((s) => s.score > 0);

    console.log(
      `[AI] Generated ${scored.length} candidates. History size: ${recentlyGeneratedIds.size}`,
    );

    const isGlobalShuffle = normalizedSelected.length === 0;
    let selected: Smol[] = [];

    if (isGlobalShuffle) {
      // Pick TARGET_SONGS random candidates from the pool
      const pool = scored.map((s) => s.smol);
      selected = pool.sort(() => Math.random() - 0.5).slice(0, TARGET_SONGS);
    } else {
      // Standard relevance-based selection
      scored.sort((a, b) => b.score - a.score);
      selected = scored.slice(0, TARGET_SONGS).map((s) => s.smol);
    }

    // Smart Shuffle: Prevent artist clustering (always apply for spacing)
    selected = smartShuffle(selected);

    generatedPlaylist = selected;
    currentIndex = 0;
    isGenerating = false;
    isActiveGlobalShuffle = isGlobalShuffle;
    showBuilder = false;

    if (selected.length > 0) {
      // Update history for next time
      recentlyGeneratedIds = new Set(selected.map((s) => s.Id));
      console.log(
        `[AI] Updated history. New size: ${recentlyGeneratedIds.size}`,
      );
      playSongAtIndex(0);
    }

    // AI: Generate station name and description
    if (GEMINI_API_KEY) {
      generateStationName(selectedTags, GEMINI_API_KEY).then((name) => {
        stationName = name;
      });
      generateStationDescription(
        selectedTags,
        selected.length,
        GEMINI_API_KEY,
      ).then((desc) => {
        stationDescription = desc;
      });
    } else {
      stationName = "Your Radio Station";
    }

    // Auto-switch to player view after generation
    showBuilder = false;
  }

  // Smart Shuffle: Spacing Algorithm
  function smartShuffle(list: Smol[]): Smol[] {
    const artists = new Map<string, Smol[]>();
    list.forEach((s) => {
      const a = s.Address || "Unknown";
      if (!artists.has(a)) artists.set(a, []);
      artists.get(a)?.push(s);
    });

    const result: Smol[] = [];
    let lastArtist = "";
    let entries = Array.from(artists.entries()); // [ [Artist, [Songs]], ... ]

    // Shuffle song lists internally first
    entries.forEach(([_, songs]) => songs.sort(() => Math.random() - 0.5));

    while (result.length < list.length) {
      // Filter out empty artists
      entries = entries.filter((e) => e[1].length > 0);
      if (entries.length === 0) break;

      // Try to find an artist who is NOT the last one
      let candidates = entries.filter((e) => e[0] !== lastArtist);

      // If only the last artist is left, we have to pick them
      if (candidates.length === 0) candidates = entries;

      // Pick random artist
      const chosenIdx = Math.floor(Math.random() * candidates.length);
      const [artist, songs] = candidates[chosenIdx];

      // Pick their next song
      const song = songs.pop();
      if (song) {
        result.push(song);
        lastArtist = artist;
      }
    }
    return result;
  }

  async function saveAsMixtape() {
    if (!isAuthenticated() || isSavingMixtape || generatedPlaylist.length === 0)
      return;

    isSavingMixtape = true;
    try {
      const draft: MixtapeDraft = {
        title: stationName || "AI Radio Mix",
        description:
          stationDescription ||
          `Generated radio station based on: ${selectedTags.join(", ")}`,
        // Map to minimum format needed for publish (API only needs IDs usually, but type needs full)
        tracks: generatedPlaylist.map((s) => ({
          id: s.Id,
          title: s.Title,
          creator: s.Address,
          coverUrl: null,
          audioUrl: null,
          lyrics: null,
        })),
      };

      await publishMixtape(draft);
      alert("Mixtape saved successfully! 💾");
    } catch (e) {
      console.error("Failed to save mixtape", e);
      alert("Failed to save mixtape. See console.");
    } finally {
      isSavingMixtape = false;
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

  let showBuilder = $state(true);

  function toggleBuilder() {
    showBuilder = !showBuilder;
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

<div
  class="container mx-auto px-4 {isCompact
    ? 'pt-2 pb-4'
    : 'py-4'} relative z-10 w-full flex flex-col justify-center"
>
  <!-- Eigengrau Void (Removed) -->

  <div
    class="relative transition-all duration-700 ease-in-out {isCompact
      ? 'pt-0'
      : 'py-2 md:py-8'}"
  >
    <!-- HEADER / TUNER CONTROLS (Only show when Builder is active) -->
    {#if showBuilder || generatedPlaylist.length === 0}
      <div>
        <div
          class="flex flex-col gap-6 {isCompact
            ? 'mb-0'
            : 'mb-4'} transition-all duration-500 {isCompact
            ? 'max-w-6xl mx-auto w-full'
            : ''}"
        >
          <!-- COMPACT ROW: Logo + Input + Ignite -->
          {#if false}
            <!-- STASHED HEADER LOGIC PER USER REQUEST (TAGS MENU ETC) -->
            {#if isCompact}
              <div
                class="flex flex-wrap items-center justify-between md:justify-start gap-4 animate-in fade-in slide-in-from-top-4 duration-500"
              >
                <div
                  class="flex items-center gap-1 cursor-pointer group select-none"
                  onclick={() => (generatedPlaylist = [])}
                >
                  <h2
                    class="text-3xl font-thin tracking-tighter text-white flex items-center gap-1"
                    style="text-shadow: 0 0 15px rgba(255,255,255,0.3);"
                  >
                    <span class="text-[#9ae600] font-bold">SMOL</span>
                    <span class="font-thin text-white">RADIO</span>
                  </h2>
                </div>

                <!-- Quick Mood Input (Full width on mobile, middle on desktop) -->
                {#if GEMINI_API_KEY}
                  <div
                    class="w-full order-last md:order-none md:w-auto md:flex-1 max-w-xl flex gap-2"
                  >
                    <input
                      bind:value={moodInput}
                      placeholder="Add a vibe..."
                      class="reactive-input flex-1 px-4 py-2 text-sm placeholder-white/20 focus:outline-none transition-all font-mono bg-black/40 border border-white/10 focus:border-[#2775ca]"
                      onkeydown={(e) =>
                        e.key === "Enter" && suggestTagsFromMood()}
                      disabled={isFetchingMood}
                    />
                    <button
                      class="reactive-button text-[#19859b] font-bold px-4 py-2 transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                      onclick={suggestTagsFromMood}
                      disabled={!moodInput.trim() || isFetchingMood}
                    >
                      {isFetchingMood ? "..." : "+"}
                    </button>
                  </div>
                {/if}

                <!-- REGENERATE -->
                <div class="flex items-center gap-4">
                  <button
                    class="reactive-button-ignite h-10 w-10 flex items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 border border-[#F7931A] text-[#F7931A] bg-[#F7931A]/10 shadow-[0_0_20px_rgba(247,147,26,0.3)] hover:bg-[#F7931A]/20 hover:text-white"
                    onclick={generateStation}
                    title="Regenerate Station"
                    disabled={isGenerating}
                  >
                    <span class:animate-spin={isGenerating}>↻</span>
                  </button>

                  <!-- TOGGLE CLOUD -->
                  <button
                    class="text-white/40 hover:text-white text-xs uppercase tracking-widest transition-colors"
                    onclick={() => (showAll = !showAll)}
                  >
                    {showAll ? "Hide Tags" : "Tags"}
                  </button>
                </div>
              </div>
            {:else}
              <!-- FULL HEADER (Initial State) -->
              <div
                class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 animate-in fade-in zoom-in-95 duration-500"
              >
                <div>
                  <h2
                    class="text-2xl md:text-4xl font-thin tracking-tighter text-white mb-2"
                    style="text-shadow: 0 0 20px rgba(255,255,255,0.3);"
                  >
                    <span class="text-[#9ae600] font-bold">SMOL</span>
                    <span class="font-thin text-white">RADIO</span>
                  </h2>
                  <p class="text-white/60 text-sm tracking-wide font-light">
                    SELECT UP TO {MAX_TAGS} VIBES
                  </p>
                </div>
                <!-- Sort & Filter Controls -->
                <!-- Sort & Filter Controls (Moved to Tag Cloud) -->
              </div>
            {/if}
          {/if}

          <!-- TAG CLOUD (Collapsible) -->
          {#if showCloud}
            <div
              class="md:col-span-7 reactive-glass flex flex-col items-center p-4 md:p-6 border border-white/5 transition-all duration-500 relative z-40 rounded-xl overflow-hidden"
            >
              <!-- Title Bar -->
              <div
                class="w-full flex items-center justify-between mb-3 pb-3 border-b border-white/10"
              >
                <h3
                  class="text-xs uppercase tracking-[0.2em] text-white/50 font-semibold"
                >
                  {isDreamMode ? "✨ Dream Mode" : "🎵 Vibe Builder"}
                </h3>

                {#if generatedPlaylist.length > 0}
                  <button
                    class="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-[#1b8da0] border border-[#1b8da0]/30 rounded-full hover:bg-[#1b8da0]/10 transition-all uppercase tracking-widest bg-black/20"
                    onclick={() => (showBuilder = false)}
                  >
                    Return to Player →
                  </button>
                {/if}
              </div>

              <!-- Selected Vibes Row -->
              <div
                class="w-full flex flex-wrap items-center justify-between gap-2 mb-3"
              >
                {#if selectedTags.length > 0}
                  <div class="flex flex-wrap gap-2 items-center">
                    {#each selectedTags as tag}
                      <span
                        class="px-2 py-0.5 text-[10px] bg-[#872ab0] text-white rounded-full border border-[#872ab0]/50 shadow-[0_0_12px_rgba(135,42,176,0.6)] flex items-center gap-1.5 cursor-pointer hover:bg-[#872ab0]/90 transition-all"
                        onclick={() => removeTag(tag)}
                      >
                        {tag}
                        <span class="text-[8px] opacity-70 hover:opacity-100"
                          >✕</span
                        >
                      </span>
                    {/each}
                    <button
                      class="text-[10px] text-white/30 hover:text-red-400 transition-colors ml-1"
                      onclick={clearTags}
                    >
                      Clear All
                    </button>
                  </div>
                {:else}
                  <span class="text-[10px] text-white/30"
                    >No vibes selected</span
                  >
                {/if}
              </div>
              <!-- Toolbar: Search & Sort -->
              <div
                class="w-full flex gap-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300"
              >
                <form
                  class="relative flex-1 group"
                  onsubmit={(e) => {
                    e.preventDefault();
                    if (isDreamMode && !isFetchingMood && moodInput.trim()) {
                      suggestTagsFromMood();
                    }
                  }}
                >
                  <button
                    type="button"
                    class="absolute left-2 top-1/2 -translate-y-1/2 transition-all duration-300 z-50 flex items-center justify-center w-11 h-11 rounded-full cursor-pointer {isDreamMode
                      ? 'bg-[#fdda24]/10 text-[#fdda24] shadow-[0_0_10px_rgba(253,218,36,0.2)]'
                      : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}"
                    onclick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      isDreamMode = !isDreamMode;
                    }}
                    title={isDreamMode
                      ? "Switch to Search"
                      : "Switch to Dream Mode"}
                  >
                    <!-- SPARKLE ICON (Always visible, changes color) -->
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      class="w-5 h-5 transition-transform duration-300 {isDreamMode
                        ? 'scale-110'
                        : 'scale-90'}"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.394a.75.75 0 010 1.422l-1.183.394c-.447.15-.799.5-.948.948l-.394 1.183a.75.75 0 01-1.422 0l-.394-1.183a1.5 1.5 0 00-.948-.948l-1.183-.394a.75.75 0 010-1.422l1.183-.394c.447-.15.799-.5.948-.948l.394-1.183A.75.75 0 0116.5 15z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>

                  {#if isDreamMode}
                    <input
                      type="text"
                      bind:value={moodInput}
                      placeholder="Dream it... (e.g. 'Chill Vibes')"
                      class="reactive-input w-full pl-14 pr-12 py-3 text-base placeholder-[#fdda24]/50 text-[#fdda24] border-[#fdda24]/30 focus:border-[#fdda24] focus:outline-none transition-all"
                      disabled={isFetchingMood}
                      enterkeyhint="go"
                      autofocus
                    />
                    <button
                      class="absolute right-2 top-1/2 -translate-y-1/2 text-[#fdda24] hover:text-white disabled:opacity-50 p-3 cursor-pointer z-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      type="submit"
                      onclick={() => {}}
                      disabled={!moodInput.trim() || isFetchingMood}
                    >
                      {#if isFetchingMood}
                        <span class="animate-spin text-xs">↻</span>
                      {:else}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          class="w-5 h-5"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      {/if}
                    </button>
                  {:else}
                    <input
                      type="text"
                      bind:value={searchQuery}
                      placeholder="Search vibes..."
                      class="reactive-input w-full pl-14 pr-4 py-3 text-base placeholder-white/30 focus:outline-none transition-all"
                      onkeydown={(e) => e.key === "Enter" && e.preventDefault()}
                    />
                  {/if}
                </form>

                <select
                  bind:value={sortMode}
                  class="reactive-input px-4 py-2 text-sm focus:outline-none appearance-none cursor-pointer hover:bg-white/5 transition-colors text-white/60 hover:text-white"
                >
                  <option value="popularity" class="bg-slate-900"
                    >Popularity</option
                  >
                  <option value="frequency" class="bg-slate-900"
                    >Frequency</option
                  >
                  <option value="alphabetical" class="bg-slate-900">A-Z</option>
                </select>
              </div>
              <div
                class="flex flex-wrap gap-x-2 gap-y-2 justify-center max-h-[35vh] md:max-h-64 overflow-y-auto dark-scrollbar w-full p-2"
              >
                {#each displayedTags as { tag, count }}
                  <button
                    class="reactive-pill px-3 py-1 transition-all duration-200 disabled:opacity-20 whitespace-nowrap font-mono text-[10px] md:text-xs"
                    class:selected={selectedTags.includes(tag)}
                    class:text-white={!selectedTags.includes(tag)}
                    class:opacity-60={!selectedTags.includes(tag)}
                    style="font-size: {isCompact
                      ? '0.75rem'
                      : getFontSize(count, maxCount)};"
                    onclick={() => toggleTag(tag)}
                    disabled={!selectedTags.includes(tag) &&
                      selectedTags.length >= MAX_TAGS}
                  >
                    {tag}
                  </button>
                {/each}
              </div>

              {#if !isCompact && !searchQuery && processedTags.length > INITIAL_TAG_LIMIT}
                <button
                  class="mt-4 text-xs font-bold tracking-[0.2em] text-white/40 hover:text-white transition-colors uppercase w-full py-2 border-t border-white/5"
                  onclick={() => (showAll = !showAll)}
                >
                  {showAll ? "Collapse" : `Show All (${processedTags.length})`}
                </button>
              {/if}
            </div>
          {/if}

          <!-- MAIN IGNITE BUTTON (Only if not compact) -->
          {#if !isCompact}
            <div
              class="flex justify-center mt-6 mb-8 md:mb-0 gap-6 items-center"
            >
              <button
                class="reactive-button-ignite w-full md:w-auto text-white font-bold py-4 px-8 md:py-4 md:px-12 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] text-lg md:text-lg border-2 border-[#F7931A] shadow-[0_0_30px_rgba(247,147,26,0.6)] hover:shadow-[0_0_40px_rgba(247,147,26,0.8)] hover:border-[#F7931A] md:shadow-[0_0_15px_rgba(247,147,26,0.4)] rounded-xl"
                onclick={() => {
                  if (isDreamMode && moodInput.trim()) {
                    suggestTagsFromMood();
                  } else {
                    generateStation();
                  }
                }}
                disabled={isGenerating ||
                  (isDreamMode && isFetchingMood && !moodInput.trim())}
              >
                {isGenerating || isFetchingMood ? "SYNTHESIZING..." : "IGNITE"}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- PLAYLIST RESULTS (Intelligently Available) -->
    {#if generatedPlaylist.length > 0 && !showBuilder}
      <div class="animate-in fade-in slide-in-from-bottom-8 duration-700">
        <RadioResults
          {generatedPlaylist}
          {selectedTags}
          {isPlaying}
          currentSongIndex={currentIndex}
          {stationName}
          {stationDescription}
          {isSavingMixtape}
          onNext={playNext}
          onPrev={playPrev}
          onPlaySong={playSongAtIndex}
          onTogglePlay={togglePlayPause}
          onSaveMixtape={saveAsMixtape}
          onRegenerate={generateStation}
          onRemoveTag={removeTag}
          isGlobalShuffle={isActiveGlobalShuffle}
          onShowBuilder={() => (showBuilder = true)}
        />
      </div>
    {/if}
  </div>
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
</style>
