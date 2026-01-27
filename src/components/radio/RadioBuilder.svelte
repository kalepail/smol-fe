<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    registerSongNextCallback,
    setPlaylistContext,
    togglePlayPause,
    isPlaying as getIsPlaying,
  } from "../../stores/audio.svelte.ts";
  import RadioPlayer from "./RadioPlayer.svelte";
  import RadioResults from "./RadioResults.svelte";
  import {
    moodToTags,
    generateStationName,
    generateStationDescription,
  } from "../../services/ai/gemini";
  import {
    publishMixtape,
    getMixtapeDetail,
  } from "../../services/api/mixtapes";
  import { isAuthenticated } from "../../stores/user.svelte.ts";
  import type { MixtapeDraft } from "../../types/domain";
  import { getFullSnapshot, safeFetchSmols } from "../../services/api/smols";
  import {
    getSnapshotTagStats,
    getUnifiedTags,
    shouldLogTagDiagnostics,
    sortTagStats,
  } from "../../services/tags/unifiedTags";
  import type {
    TagMeta,
    TagSortMode,
    TagStat,
  } from "../../services/tags/unifiedTags";

  // Smols are now fetched live on mount, not passed as prop
  let smols = $state<Smol[]>([]);
  let isLoadingSmols = $state(true);

  const GEMINI_API_KEY = import.meta.env.PUBLIC_GEMINI_API_KEY;

  const MAX_TAGS = 5;
  const TARGET_SONGS = 20;
  const INITIAL_TAG_LIMIT = 50;
  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

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
  let sortMode = $state<TagSortMode>("popularity");

  // AI-powered features
  let showBuilder = $state(true);
  let moodInput = $state("");
  let isFetchingMood = $state(false);
  let stationName = $state("Your Radio Station");
  let stationDescription = $state("");
  let isSavingMixtape = $state(false);
  let isAiLoading = $state(false);
  let isDreamMode = $state(false);
  let isActiveGlobalShuffle = $state(false);
  let hasLoggedCloud = $state(false);
  let hasLoggedTags = $state(false);

  // Initialize empty, load on mount
  let tagStats = $state<TagStat[]>([]);
  let tagMeta = $state<TagMeta>({
    snapshotTagsCount: 0,
    liveTagsCount: 0,
    finalTagsCount: 0,
    dataSourceUsed: "snapshot",
  });

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
      // console.error("AI Assist failed:", e);
    } finally {
      isAiLoading = false;
    }
  }

  // History for Deduplication (prevent "same 20 songs" on re-roll)
  let recentlyGeneratedIds = $state<Set<string>>(new Set());
  let isInitialized = false;

  async function initializeData() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. Load persisted state (if no URL tags present, or merge?)
    const saved = localStorage.getItem("smol_radio_state");
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.selectedTags) selectedTags = state.selectedTags;
        if (state.generatedPlaylist)
          generatedPlaylist = state.generatedPlaylist;
        if (state.stationName) stationName = state.stationName;
        if (state.stationDescription)
          stationDescription = state.stationDescription;
        if (state.isActiveGlobalShuffle !== undefined)
          isActiveGlobalShuffle = state.isActiveGlobalShuffle;
        if (state.currentIndex !== undefined) currentIndex = state.currentIndex;

        if (state.generatedPlaylist && state.generatedPlaylist.length > 0) {
          showBuilder = false;
        } else if (state.showBuilder !== undefined) {
          showBuilder = state.showBuilder;
        }

        // Reset history set from loaded IDs
        if (state.generatedPlaylist) {
          recentlyGeneratedIds = new Set(
            state.generatedPlaylist.map((s: Smol) => s.Id),
          );
        }
      } catch (e) {
        // console.error("Failed to restore radio state:", e);
      }
    }

    // Load snapshot tags immediately
    try {
      const snap = await getSnapshotTagStats();
      tagStats = snap.tags;
      tagMeta = snap.meta;
    } catch (e) {
      // console.error("Failed to load snapshot tags:", e);
    }

    // 0. USE SNAPSHOT DIRECTLY (Backend-Independent)
    try {
      isLoadingSmols = true;
      smols = await getFullSnapshot();
      const liveSmols = await safeFetchSmols();
      if (liveSmols.length > 0) {
        smols = liveSmols;
      }
    } catch (e) {
      smols = [];
    } finally {
      isLoadingSmols = false;
    }

    try {
      const unified = await getUnifiedTags({ liveSmols: smols });
      tagStats = unified.tags;
      tagMeta = unified.meta;
    } catch (error) {
      // console.error("Failed to harmonize tags:", error);
    }
  }

  // Handle URL params for "Send to Radio" feature from TagExplorer
  async function handleUrlParams() {
    const radioUrlParams = new URLSearchParams(window.location.search);
    const playId = radioUrlParams.get("play");
    const urlTags = radioUrlParams.getAll("tag");
    const mixtapeId = radioUrlParams.get("mixtape");

    if (urlTags.length > 0) {
      selectedTags = urlTags.slice(0, MAX_TAGS);
    } else if (playId) {
      // If we have a playId but NO tags in the URL, we should likely clear old tags
      // so they can be re-extracted from the new seed song below.
      selectedTags = [];
    }

    // Ensure data is loaded before processing play/mixtape params
    if (smols.length === 0) {
      await initializeData();
    }

    // Check for Mixtape param to seed radio
    if (mixtapeId && !generatedPlaylist.length) {
      try {
        const detail = await getMixtapeDetail(mixtapeId);
        if (detail && detail.tracks.length > 0) {
          // Map to Smol format. Try to enrich with loaded smols if available.
          const smolMap = new Map(smols.map((s) => [s.Id, s]));

          generatedPlaylist = detail.tracks.map((t) => {
            const existing = smolMap.get(t.Id);
            if (existing) return existing;

            // Fallback minimal smol
            return {
              Id: t.Id,
              Title: t.Title,
              Address: t.Address,
              Song_1: t.Song_1 || t.Id,
              artist: t.Address, // Helper for UI
              // Add other required fields with defaults
              n: 0,
              ar: 0,
              att: 0,
              sa: 0,
              lat: 0,
              lng: 0,
              style: "",
              img: "",
              thumb: "",
            } as unknown as Smol;
          });

          stationName = detail.title;
          stationDescription = detail.description || "Imported Mixtape";
          showBuilder = false;
        }
      } catch (e) {
        console.error("Failed to seed radio from mixtape:", e);
      }
    }

    // Handle "seed song" if it exists
    if (playId) {
      // Find the song in our hydrated pool
      const seedSong = smols.find((s) => s.Id === playId);

      if (seedSong) {
        // If we didn't get tags from URL, extract from song
        if (selectedTags.length === 0) {
          selectedTags = getTags(seedSong).slice(0, 5);
        }

        // Generate station seeded with this song
        setTimeout(() => {
          generateStation(seedSong);
          showBuilder = false;
        }, 50);
      } else {
        // Fallback: If song not found but tags exist, generate anyway
        if (selectedTags.length > 0) {
          generateStation();
        }
      }
    } else if (urlTags.length > 0) {
      // No specific song seed, but we have tags
      setTimeout(() => {
        generateStation();
      }, 50);
    }

    // Clean URL
    if (playId || urlTags.length > 0 || mixtapeId) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  onMount(() => {
    // Initial load: fetch data and then process any params (async)
    (async () => {
      await initializeData();
      await handleUrlParams();
    })();

    // Listen for Astro navigation (handles "Send to Radio" while already on Radio page)
    document.addEventListener("astro:after-navigation", handleUrlParams);

    return () => {
      document.removeEventListener("astro:after-navigation", handleUrlParams);
    };
  });

  // Persist state on change
  $effect(() => {
    if (typeof window === "undefined") return;

    const stateToSave = {
      selectedTags,
      generatedPlaylist,
      stationName,
      stationDescription,
      isActiveGlobalShuffle,
      currentIndex,
      showBuilder,
    };

    localStorage.setItem("smol_radio_state", JSON.stringify(stateToSave));
  });

  // Extract tags from smols
  function getTags(smol: Smol): string[] {
    const tags: string[] = [];
    if (smol.Tags) tags.push(...smol.Tags);
    if (smol.lyrics?.style) tags.push(...smol.lyrics.style);
    return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
  }

  // Aggregate all tags with counts and real engagement metrics
  let processedTags = $derived.by(() => sortTagStats(tagStats, sortMode));

  let filteredTags = $derived.by(() => {
    if (!searchQuery) return processedTags;
    const q = searchQuery.toLowerCase();
    return processedTags.filter((t) => t.tag.toLowerCase().includes(q));
  });

  let displayedTags = $derived.by(() => {
    if (showAll || searchQuery) return filteredTags;
    return filteredTags.slice(0, INITIAL_TAG_LIMIT);
  });

  const isLoadingTags = $derived(isLoadingSmols && tagStats.length === 0);

  const maxMetrics = $derived.by(() => {
    if (processedTags.length === 0) return { count: 1, popularity: 1 };
    return {
      count: Math.max(...processedTags.map((t) => t.count)),
      popularity: Math.max(...processedTags.map((t) => t.popularity)),
    };
  });

  let isCompact = $derived(generatedPlaylist.length > 0 && !showBuilder);
  let showCloud = $derived(!isCompact || showAll);

  $effect(() => {
    if (!import.meta.env.DEV || hasLoggedCloud) return;
    if (showCloud) {
      // console.log("[Radio] Rendering NEW tag cloud (RadioBuilder)");
      hasLoggedCloud = true;
    }
  });

  $effect(() => {
    if (hasLoggedTags || !shouldLogTagDiagnostics()) return;
    if (tagMeta) {
      // console.log(
      //   `[Radio] Tag counts (snapshot=${tagMeta.snapshotTagsCount}, live=${tagMeta.liveTagsCount}, final=${tagMeta.finalTagsCount}, source=${tagMeta.dataSourceUsed})`,
      // );
      if (tagMeta.finalTagsCount < tagMeta.snapshotTagsCount) {
        // console.warn(
        //   "[Radio] finalTagsCount < snapshotTagsCount (should never happen)",
        // );
      }
      hasLoggedTags = true;
    }
  });

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

  function getFontSize(
    tagObj: { count: number; popularity: number },
    max: { count: number; popularity: number },
  ): string {
    const minSize = 0.7;
    const maxSize = 1.2; // Reduced for compactness

    let val = tagObj.count;
    let maxVal = max.count;

    if (sortMode === "popularity") {
      val = tagObj.popularity;
      maxVal = Math.max(1, max.popularity);
    }

    // Log scaling to prevent outlier dominance
    const normalized = Math.log(val + 1) / Math.log(maxVal + 1);
    const size = minSize + (maxSize - minSize) * normalized;
    return `${size.toFixed(2)}rem`;
  }

  function getOpacity(
    tagObj: { count: number; popularity: number },
    max: { count: number; popularity: number },
  ): number {
    const min = 0.5;

    let val = tagObj.count;
    let maxVal = max.count;

    if (sortMode === "popularity") {
      val = tagObj.popularity;
      maxVal = Math.max(1, max.popularity);
    }

    return min + (1 - min) * (Math.log(val + 1) / Math.log(maxVal + 1));
  }

  // Cache for AI responses to avoid repeating requests
  const suggestCache = new Map<string, string[]>();

  // Use full DB knowledge to find tags based on lyrics/titles
  function findTagsFromContent(terms: string[]): string[] {
    const termMatches = new Map<string, number>();

    smols.forEach((smol) => {
      const title = (smol.Title || "").toLowerCase();
      const lyrics = (
        smol.lyrics?.lyrics ||
        smol.kv_do?.lyrics?.lyrics ||
        ""
      ).toLowerCase();

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
        // console.warn("[AI] API failed, using fallback", e);
      }
    }

    // 3. Local Fallback if API returned nothing
    if (suggestions.length === 0) {
      // console.log("[AI] Using local fallback");
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

  async function generateStation(seedSong?: Smol) {
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
          const lyrics = normalizeTag(
            smol.lyrics?.lyrics || smol.kv_do?.lyrics?.lyrics || "",
          );
          return title.includes(term) || lyrics.includes(term);
        })
          ? 25
          : 0;

        // Popularity: drastically reduced to just be a tie-breaker (0.01)
        // This prevents pop songs from crashing a niche playlist just because they have 10k plays
        const popularity = (smol.Plays || 0) * 0.01 + (smol.Views || 0) * 0.005;

        // Recency Bonus: Boost for new uploads (0-30 days)
        // Max 50 points, decays to 0 over 30 days
        const daysOld =
          (Date.now() - new Date(smol.Created_At || 0).getTime()) /
          (1000 * 3600 * 24);
        const recencyBonus = Math.max(0, 50 - daysOld * (50 / 30));

        // Random Jitter: Add variety (0-15 points)
        // Ensures identical tag matches don't always sort in same order
        const jitter = Math.random() * 15;

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
                  recencyBonus +
                  jitter +
                  (isGlobalShuffle ? 1 : 0)) *
                historyPenalty
              : 0,
        };
      })
      .filter((s) => s.score > 0);

    // console.log(
    //   `[AI] Generated ${scored.length} candidates. History size: ${recentlyGeneratedIds.size}`,
    // );

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

    // Force Seed Song to front (Seamless Playback)
    if (seedSong) {
      selected = selected.filter((s) => s.Id !== seedSong.Id);
      selected = [seedSong, ...selected];
    }

    generatedPlaylist = selected;
    currentIndex = 0;
    isGenerating = false;
    isActiveGlobalShuffle = isGlobalShuffle;
    showBuilder = false;

    if (selected.length > 0) {
      // Update history for next time
      recentlyGeneratedIds = new Set(selected.map((s) => s.Id));
      // console.log(
      //   `[AI] Updated history. New size: ${recentlyGeneratedIds.size}`,
      // );
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

  // Smooth Flow Algorithm: DJ-Quality Sequencing
  // Creates natural transitions by considering tag similarity between adjacent songs
  function smartShuffle(list: Smol[]): Smol[] {
    if (list.length <= 2) return list;

    // 1. Group by artist for variety
    const artists = new Map<string, Smol[]>();
    list.forEach((s) => {
      const a = s.Address || "Unknown";
      if (!artists.has(a)) artists.set(a, []);
      artists.get(a)?.push(s);
    });

    // 2. Calculate tag sets for each song (for flow scoring)
    const tagSets = new Map<string, Set<string>>();
    list.forEach((s) => {
      const tags = new Set(getTags(s).map((t) => normalizeTag(t)));
      tagSets.set(s.Id, tags);
    });

    // 3. Flow scoring: how well two songs transition
    function flowScore(a: Smol, b: Smol): number {
      const tagsA = tagSets.get(a.Id) || new Set();
      const tagsB = tagSets.get(b.Id) || new Set();

      // Count shared tags
      let shared = 0;
      tagsA.forEach((t) => {
        if (tagsB.has(t)) shared++;
      });

      // Ideal: 1-2 shared tags (enough for flow, not too similar)
      // 0 shared = jarring (low score)
      // 1-2 shared = smooth (high score)
      // 3+ shared = too similar (medium score)
      if (shared === 0) return 10;
      if (shared === 1) return 100;
      if (shared === 2) return 90;
      if (shared === 3) return 60;
      return 40; // Very similar = less interesting
    }

    // 4. Greedy sequencing with flow optimization
    const result: Smol[] = [];
    const used = new Set<string>();
    let lastArtist = "";
    let lastTwo: Smol[] = []; // Track last 2 for anti-repeat

    // Start with a random song
    const startIdx = Math.floor(Math.random() * list.length);
    result.push(list[startIdx]);
    used.add(list[startIdx].Id);
    lastArtist = list[startIdx].Address || "";
    lastTwo.push(list[startIdx]);

    while (result.length < list.length) {
      const current = result[result.length - 1];
      let best: Smol | null = null;
      let bestScore = -Infinity;

      for (const song of list) {
        if (used.has(song.Id)) continue;

        let score = flowScore(current, song);

        // Artist variety bonus: penalize same artist, especially if recent
        const songArtist = song.Address || "";
        if (songArtist === lastArtist) {
          score -= 80; // Strong penalty for back-to-back
        }
        // Check last 2 songs for artist variety
        if (lastTwo.some((s) => s.Address === songArtist)) {
          score -= 40;
        }

        // Discovery boost: slight bonus for less-played songs (hidden gems)
        const plays = song.Plays || 0;
        if (plays < 100) score += 15; // Hidden gem boost

        // Freshness: slight random factor to avoid predictability
        score += Math.random() * 20;

        if (score > bestScore) {
          bestScore = score;
          best = song;
        }
      }

      if (best) {
        result.push(best);
        used.add(best.Id);
        lastArtist = best.Address || "";
        lastTwo = [lastTwo[lastTwo.length - 1], best].filter(Boolean);
      } else {
        break;
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
          creator: s.Address || null,
          coverUrl: null,
        })),
      };

      await publishMixtape(draft);
      alert("Mixtape saved successfully! 💾");
    } catch (e) {
      // console.error("Failed to save mixtape", e);
      alert("Failed to save mixtape. See console.");
    } finally {
      isSavingMixtape = false;
    }
  }

  function playSongAtIndex(index: number) {
    if (index >= 0 && index < generatedPlaylist.length) {
      currentIndex = index;
      const song = generatedPlaylist[index];

      // Prevent audio reset if song is already loaded
      if (audioState.currentSong?.Id !== song.Id) {
        selectSong(song);
      } else {
        // If it's the same song but we are "paused", we might want to ensure playing?
        // But "seamless" usually means respecting current state (even if paused).
        // If the user clicked "Radio", they might expect it to start if paused?
        // But for now, preserving state is safest for "seamless".
        // If we want to force play:
        if (!audioState.playingId) {
          selectSong(song);
        }
      }
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

  // Store playlist context for fallback playback when navigating to pages without playlists
  $effect(() => {
    if (generatedPlaylist.length > 0) {
      setPlaylistContext(generatedPlaylist, currentIndex);
    }
  });

  const estimatedDuration = $derived(
    Math.round(generatedPlaylist.length * 2.5),
  );
</script>

<div
  class="container mx-auto px-4 {isCompact
    ? 'pt-1 pb-2'
    : 'py-1'} {audioState.currentSong
    ? 'pb-48'
    : ''} relative z-10 w-full flex-1 min-h-0 flex flex-col overflow-hidden"
>
  <!-- Eigengrau Void (Removed) -->

  <div
    class="relative transition-all duration-700 ease-in-out {isCompact
      ? 'pt-0'
      : 'py-2 md:pt-2 md:pb-8'}"
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
          <div
            class="reactive-glass flex flex-col flex-1 min-h-0 border border-white/5 bg-[#1d1d1d] max-w-2xl mx-auto rounded-[32px] lg:rounded-xl w-full pb-6 overflow-hidden"
          >
            <div
              class="flex items-center justify-between px-6 py-2 border-b border-white/5 bg-black/40 mb-1 rounded-t-xl"
            >
              <div class="flex items-center gap-4">
                <h1
                  class="text-lg md:text-xl font-black tracking-tighter font-pixel shrink-0"
                >
                  <span class="text-[#9ae600]">SMOL</span><span
                    class="relative text-white"
                    >RADIO<span
                      class="absolute -top-1 right-0 text-[5px] text-[#FDDA24] font-pixel uppercase tracking-widest"
                      >PRE-ALPHA</span
                    ></span
                  >
                </h1>

                <div class="h-4 w-px bg-white/10 hidden md:block"></div>

                <h3
                  class="text-[10px] md:text-xs uppercase tracking-[0.2em] text-[#9ae600] font-pixel font-bold pt-0.5 hidden md:block"
                >
                  {isDreamMode ? "✨ DREAM MODE" : "🎵 VIBE BUILDER"}
                </h3>
              </div>
              <div class="flex items-center gap-2">
                {#if !isCompact}
                  <button
                    class="text-[10px] font-pixel font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors underline"
                    onclick={() => (showBuilder = false)}
                  >
                    Back
                  </button>
                {/if}
              </div>
            </div>

            <div class="p-4 md:pt-4 md:pb-2 flex flex-col items-center">
              <p
                class="text-white/70 text-[10px] tracking-[0.2em] uppercase font-pixel mb-1 animate-arcade-pulse"
              >
                Select up to {MAX_TAGS} vibes
              </p>

              {#if generatedPlaylist.length > 0}
                {#if audioState.currentSong}
                  <div
                    class="w-full max-w-[90%] md:max-w-[400px] mt-2 mb-2 bg-[#2a2a2a] border border-white/10 rounded-xl p-2 pr-4 flex items-center gap-3 shadow-lg cursor-pointer hover:bg-[#333] transition-colors group relative overflow-hidden"
                    onclick={() => (showBuilder = false)}
                    transition:fade
                  >
                    <div class="relative w-12 h-12 shrink-0">
                      <img
                        src={`${API_URL}/image/${audioState.currentSong.Id}.png?scale=8`}
                        alt="Art"
                        class="w-full h-full rounded-lg object-cover shadow-sm bg-black"
                      />
                      <div
                        class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                      >
                        <span class="text-white text-xs">⤢</span>
                      </div>
                    </div>

                    <div class="flex flex-col flex-1 min-w-0 z-10">
                      <div class="flex items-center gap-2 mb-0.5">
                        {#if isPlaying}
                          <div
                            class="w-1.5 h-1.5 rounded-full bg-[#9ae600] animate-pulse"
                          ></div>
                          <span
                            class="text-[#9ae600] font-pixel text-[8px] tracking-wider"
                            >ON AIR</span
                          >
                        {:else}
                          <div
                            class="w-1.5 h-1.5 rounded-full bg-slate-500"
                          ></div>
                          <span
                            class="text-slate-400 font-pixel text-[8px] tracking-wider"
                            >PAUSED</span
                          >
                        {/if}
                      </div>
                      <span
                        class="text-white font-bold text-sm truncate leading-tight"
                        >{audioState.currentSong.Title || "Untitled"}</span
                      >
                      <span class="text-white/60 text-xs truncate leading-tight"
                        >{audioState.currentSong.artist || "Smol"}</span
                      >
                    </div>

                    <!-- Play Button (Action) -->
                    <button
                      class="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#9ae600] hover:text-black transition-all shrink-0 z-20"
                      onclick={(e) => {
                        e.stopPropagation();
                        togglePlayPause();
                      }}
                    >
                      {#if isPlaying}
                        <svg
                          class="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                          ><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg
                        >
                      {:else}
                        <svg
                          class="w-3 h-3 ml-0.5"
                          fill="currentColor"
                          viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg
                        >
                      {/if}
                    </button>
                  </div>
                  <p
                    class="text-[9px] text-zinc-500 font-pixel uppercase tracking-widest mt-1 mb-2 hover:text-zinc-300 cursor-pointer"
                    onclick={() => (showBuilder = false)}
                  >
                    Click to Resume Session
                  </p>
                {:else}
                  <button
                    class="bg-white text-black font-pixel px-6 py-2 border-4 border-white shadow-[8px_8px_0px_0px_rgba(255,255,255,0.2)] hover:bg-[#9ae600] hover:border-[#9ae600] active:translate-y-1 active:shadow-none transition-none uppercase tracking-widest text-xs"
                    onclick={() => (showBuilder = false)}
                  >
                    Return to Player →
                  </button>
                {/if}
              {/if}
            </div>

            <!-- MAIN IGNITE BUTTON -->
            <div
              class="flex justify-center mt-2 mb-2 md:mb-0 gap-6 items-center flex-shrink-0"
            >
              <button
                class="tech-button bg-[#9ae600] text-slate-900 font-black py-3 px-10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.2em] text-base shadow-[0_0_15px_rgba(154,230,0,0.3)] hover:scale-105 active:scale-95 group relative overflow-hidden font-pixel"
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

            <!-- TAG CLOUD (Collapsible) -->
            {#if showCloud}
              <div
                class="w-full reactive-glass border border-white/10 p-6 transition-all duration-500 relative z-40 rounded-2xl bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
              >
                <!-- Title Bar (Mobile Only) -->
                <div
                  class="w-full flex items-center justify-between mb-2 md:hidden"
                >
                  <h3
                    class="text-[10px] uppercase tracking-[0.2em] text-[#9ae600] font-bold font-pixel"
                  >
                    {isDreamMode ? "✨ DREAM MODE" : "🎵 VIBE BUILDER"}
                  </h3>
                </div>

                <!-- Selected Vibes Row -->
                <div
                  class="w-full flex flex-wrap items-center justify-between gap-2 mb-3"
                >
                  {#if selectedTags.length > 0}
                    <div class="flex flex-wrap gap-2 items-center">
                      {#each selectedTags as tag}
                        <span
                          class="px-2 py-0.5 text-[8px] bg-[#872ab0]/20 text-white rounded border border-[#872ab0]/30 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] flex items-center gap-1.5 cursor-pointer hover:bg-[#872ab0]/40 transition-all group shrink-0 font-pixel uppercase tracking-tighter"
                          onclick={() => removeTag(tag)}
                        >
                          <span class="max-w-[100px] truncate">{tag}</span>
                          <span class="text-white/40 group-hover:text-white"
                            >✕</span
                          >
                        </span>
                      {/each}
                      <button
                        class="text-[9px] text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors font-pixel underline ml-2"
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
                        placeholder="DREAM IT... (E.G. 'CHILL VIBES')"
                        class="w-full pl-12 pr-12 py-2 text-xs placeholder-white/20 text-white bg-white/5 border border-white/10 rounded-lg focus:border-[#9ae600]/50 focus:outline-none focus:bg-white/10 transition-all font-pixel uppercase tracking-tight"
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
                        placeholder="SEARCH VIBES..."
                        class="w-full pl-12 pr-4 py-2 text-xs placeholder-white/20 text-white bg-white/5 border border-white/10 rounded-lg focus:border-[#9ae600]/50 focus:outline-none focus:bg-white/10 transition-all font-pixel uppercase tracking-tight"
                        onkeydown={(e) =>
                          e.key === "Enter" && e.preventDefault()}
                      />
                    {/if}
                  </form>

                  <select
                    bind:value={sortMode}
                    class="bg-black/40 border border-white/10 text-white/80 px-3 py-1.5 text-[10px] rounded-lg focus:border-[#9ae600]/50 focus:outline-none cursor-pointer hover:bg-black/60 transition-all uppercase font-pixel tracking-tighter shadow-inner"
                  >
                    <option value="popularity" class="bg-[#1a1a1a] text-white"
                      >POPULARITY</option
                    >
                    <option value="recent" class="bg-[#1a1a1a] text-white"
                      >RECENT</option
                    >
                    <option value="frequency" class="bg-[#1a1a1a] text-white"
                      >FREQUENCY</option
                    >
                    <option value="alphabetical" class="bg-[#1a1a1a] text-white"
                      >A-Z</option
                    >
                  </select>
                </div>
                <div
                  class="flex flex-wrap gap-x-2 gap-y-2 justify-center max-h-[35vh] md:max-h-64 overflow-y-auto dark-scrollbar w-full p-2"
                >
                  {#if isLoadingTags}
                    <div
                      class="flex flex-col items-center justify-center py-12 text-white/20 animate-pulse w-full"
                    >
                      <div class="text-2xl mb-2">📡</div>
                      <div class="text-[10px] uppercase tracking-[0.2em]">
                        Scanning Airwaves...
                      </div>
                    </div>
                  {:else if displayedTags.length === 0 && searchQuery}
                    <div class="py-8 text-white/30 text-xs italic">
                      No matching vibes found
                    </div>
                  {:else}
                    {#each displayedTags as tagObj}
                      <button
                        class="tag-pill transition-all leading-none py-1.5 px-3 rounded-md border transition-all hover:scale-105 active:scale-95 font-pixel uppercase tracking-tighter {selectedTags.includes(
                          tagObj.tag,
                        )
                          ? 'text-black bg-[#9ae600] border-[#9ae600] shadow-[0_0_15px_rgba(154,230,0,0.4)]'
                          : 'text-white/60 border-white/5 hover:border-white/20 bg-white/5 hover:bg-white/10'}"
                        style="font-size: {getFontSize(
                          tagObj,
                          maxMetrics,
                        )}; opacity: {selectedTags.includes(tagObj.tag)
                          ? 1
                          : getOpacity(tagObj, maxMetrics)}"
                        onclick={() => toggleTag(tagObj.tag)}
                      >
                        {tagObj.tag}

                        <!-- Count or New Indicator -->
                        {#if selectedTags.includes(tagObj.tag)}
                          <span
                            class="text-[0.6em] align-top ml-0.5 text-black/50 font-pixel tracking-tighter"
                            >{tagObj.count}</span
                          >
                        {:else if tagObj.latest && new Date().getTime() - new Date(tagObj.latest).getTime() < 3 * 24 * 60 * 60 * 1000}
                          <!-- NEW indicator if latest song is < 3 days old -->
                          <span
                            class="text-[0.4em] align-top ml-0.5 text-[#ff0099] font-black tracking-tighter animate-pulse"
                            >new</span
                          >
                        {/if}
                      </button>
                    {/each}
                  {/if}
                </div>

                {#if !isCompact && !searchQuery && processedTags.length > INITIAL_TAG_LIMIT}
                  <button
                    class="mt-4 text-xs font-bold tracking-[0.2em] text-white/40 hover:text-white transition-colors uppercase w-full py-2 border-t border-white/5"
                    onclick={() => (showAll = !showAll)}
                  >
                    {showAll
                      ? "Collapse"
                      : `Show All (${processedTags.length})`}
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- PLAYLIST RESULTS (Intelligently Available) -->
    {#if generatedPlaylist.length > 0 && !showBuilder}
      <div
        class="flex-1 min-h-0 h-full animate-in fade-in slide-in-from-bottom-8 duration-700"
      >
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
  @keyframes arcadePulse {
    0%,
    100% {
      opacity: 1;
      text-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
    }
    50% {
      opacity: 0.3;
      text-shadow: none;
    }
  }
  .animate-arcade-pulse {
    animation: arcadePulse 1.2s infinite steps(4, end);
  }

  .tag-pill {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
  }
</style>
