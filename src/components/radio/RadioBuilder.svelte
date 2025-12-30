<script lang="ts">
  import { onMount } from "svelte";
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    registerSongNextCallback,
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

  let isCompact = $derived(generatedPlaylist.length > 0);
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
    if (!input || !GEMINI_API_KEY) return;

    isFetchingMood = true;
    let suggestions: string[] = [];

    // 1. Check Cache
    if (suggestCache.has(input.toLowerCase())) {
      suggestions = suggestCache.get(input.toLowerCase()) || [];
    } else {
      // 2. Try API
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
    if (selectedTags.length === 0) return;
    isGenerating = true;
    stationName = "Generating...";
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

        // Only include if there is SOME relevance (score > 0)
        return {
          smol,
          // deterministic score (no random)
          score:
            matchScore > 0
              ? (matchScore + keywordBonus + popularity) * historyPenalty
              : 0,
        };
      })
      .filter((s) => s.score > 0);

    console.log(
      `[AI] Generated ${scored.length} candidates. History size: ${recentlyGeneratedIds.size}`,
    );

    scored.sort((a, b) => b.score - a.score);
    let selected = scored.slice(0, TARGET_SONGS).map((s) => s.smol);

    // Smart Shuffle: Prevent artist clustering
    if (isShuffled) {
      selected = smartShuffle(selected);
    }

    generatedPlaylist = selected;
    currentIndex = 0;
    isGenerating = false;

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

  let isSettingsOpen = $state(false);

  function toggleSettings() {
    isSettingsOpen = !isSettingsOpen;
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
      : 'py-12'}"
  >
    <!-- HEADER / TUNER CONTROLS -->
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
                  onkeydown={(e) => e.key === "Enter" && suggestTagsFromMood()}
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
                class="text-4xl font-thin tracking-tighter text-white mb-2"
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

          <!-- Initial Mood Input -->
          {#if GEMINI_API_KEY}
            <div
              class="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100"
            >
              <input
                bind:value={moodInput}
                placeholder="Describe a vibe (e.g., 'summer road trip')..."
                class="reactive-input flex-1 px-6 py-4 text-lg placeholder-white/20 focus:outline-none transition-all font-mono"
                onkeydown={(e) => e.key === "Enter" && suggestTagsFromMood()}
                disabled={isFetchingMood}
              />
              <button
                class="reactive-button text-[#19859b] font-bold px-8 py-2 transition-all disabled:opacity-50 uppercase tracking-widest text-xs border border-[#19859b]/50 hover:border-[#19859b] hover:shadow-[0_0_15px_rgba(25,133,155,0.4)]"
                onclick={suggestTagsFromMood}
                disabled={!moodInput.trim() || isFetchingMood}
              >
                {isFetchingMood ? "Dreaming..." : "Dream It"}
              </button>
            </div>
          {/if}
        {/if}
      {/if}

      <!-- ACTIVE TAGS (Only visible in full mode) -->
      {#if selectedTags.length > 0 && !isCompact}
        <div class="flex flex-wrap gap-2 animate-in fade-in duration-300">
          {#each selectedTags as tag}
            <span
              class="reactive-pill selected inline-flex items-center gap-2 px-3 py-1 text-xs text-purple-300 font-mono shadow-[0_0_10px_rgba(168,85,247,0.2)]"
            >
              {tag}
              <button
                class="hover:text-white transition-colors font-bold"
                onclick={() => removeTag(tag)}>×</button
              >
            </span>
          {/each}
          {#if isCompact}
            <button
              class="text-[10px] text-white/30 hover:text-white transition-colors uppercase tracking-widest ml-2"
              onclick={clearTags}>Clear</button
            >
          {/if}
        </div>
      {/if}

      <!-- TAG CLOUD (Collapsible) -->
      {#if showCloud}
        <div
          class="reactive-glass flex flex-col items-center p-6 border border-white/5 transition-all duration-500 {isCompact
            ? 'scale-95 opacity-90'
            : ''}"
        >
          <!-- Toolbar: Search & Sort -->
          <div
            class="w-full flex gap-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <div class="relative flex-1 group">
              <span
                class="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#2276cb] transition-colors"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  ></path></svg
                >
              </span>
              <input
                type="text"
                bind:value={searchQuery}
                placeholder="Search vibes..."
                class="reactive-input w-full pl-10 pr-4 py-2.5 text-sm placeholder-white/30 focus:outline-none transition-all"
              />
            </div>

            <select
              bind:value={sortMode}
              class="reactive-input px-4 py-2 text-sm focus:outline-none appearance-none cursor-pointer hover:bg-white/5 transition-colors text-white/60 hover:text-white"
            >
              <option value="popularity" class="bg-slate-900">Popularity</option
              >
              <option value="frequency" class="bg-slate-900">Frequency</option>
              <option value="alphabetical" class="bg-slate-900">A-Z</option>
            </select>
          </div>
          <div
            class="flex flex-wrap gap-x-2 gap-y-2 justify-center max-h-64 overflow-y-auto dark-scrollbar w-full p-2"
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
        <div class="flex justify-center mt-4 gap-6 items-center">
          <label
            class="flex items-center gap-3 text-white/60 text-sm cursor-pointer hover:text-white transition-colors"
          >
            <input
              type="checkbox"
              bind:checked={isShuffled}
              class="appearance-none w-5 h-5 border border-white/20 rounded-full bg-white/5 checked:bg-[#36b04a] checked:border-black cursor-pointer transition-all checked:shadow-[0_0_15px_#36b04a] hover:border-[#36b04a]/50"
            />
            SMART SHUFFLE
          </label>

          <!-- Dream It Search Bar -->
          <div class="relative w-full max-w-md mx-auto mb-6">
            <input
              type="text"
              bind:value={moodInput}
              placeholder="Dream it... (e.g. 'cyberpunk city lights')"
              class="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-6 pr-14 text-white placeholder-white/30 focus:outline-none focus:border-[#2775ca] focus:bg-white/10 transition-all font-mono"
              onkeydown={(e) => e.key === "Enter" && handleAiAssist()}
            />
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#fdda24] hover:text-white transition-colors disabled:opacity-50"
              onclick={handleAiAssist}
              disabled={isAiLoading}
            >
              {#if isAiLoading}
                <span class="animate-spin">✨</span>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="w-5 h-5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                  />
                </svg>
              {/if}
            </button>
          </div>

          <button
            class="reactive-button-ignite text-white font-bold py-4 px-12 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] text-lg border-2 border-[#f7931a] shadow-[0_0_15px_rgba(247,147,26,0.5)] hover:shadow-[0_0_25px_rgba(247,147,26,0.7)] hover:border-[#fcd09e]"
            onclick={generateStation}
            disabled={selectedTags.length === 0 || isGenerating}
          >
            {isGenerating ? "SYNTHESIZING..." : "IGNITE"}
          </button>
        </div>
      {/if}
    </div>

    <!-- PLAYLIST RESULTS (Intelligently Available) -->
    {#if generatedPlaylist.length > 0}
      <div class="animate-in fade-in slide-in-from-bottom-8 duration-700">
        <RadioResults
          playlist={generatedPlaylist}
          {stationName}
          {stationDescription}
          {currentIndex}
          {isSavingMixtape}
          onNext={playNext}
          onPrev={playPrev}
          onSelect={playSongAtIndex}
          onSaveMixtape={saveAsMixtape}
          onRegenerate={generateStation}
          onToggleSettings={toggleSettings}
        />
      </div>
    {:else if selectedTags.length > 0}
      <div
        class="text-center text-white/30 mt-16 font-light tracking-wide animate-pulse"
      >
        Ready to ignite...
      </div>
    {:else}
      <div class="text-center text-white/40 mt-16 font-light tracking-wide">
        🔥 Select vibes and hit <span class="text-orange-500 font-semibold"
          >IGNITE</span
        > to begin transmission
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
